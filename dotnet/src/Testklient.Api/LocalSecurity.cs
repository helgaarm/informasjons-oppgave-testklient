using System.Security.Cryptography;

namespace Testklient;

public sealed class LocalSession(DateTimeOffset expires)
{
    public string Csrf { get; } = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
    public DateTimeOffset Expires { get; } = expires;
    private readonly HashSet<string> submissions = [];
    public void Reserve(string key)
    {
        lock (submissions)
        {
            if (submissions.Contains(key)) throw new IntegrationException("Denne identifikatoren er allerede sendt eller har ukjent leveringsstatus i valgt testområde i økten. Kontroller Helsenorge før du oppretter en ny oppgave.", 409, "duplicate_submission");
            if (submissions.Count >= 100) throw new IntegrationException("Økten har nådd grensen for innsendinger.", 429);
            submissions.Add(key);
        }
    }
    public void Release(string key) { lock (submissions) submissions.Remove(key); }
}

public sealed class LocalSecurity(LocalOptions options, TimeProvider clock)
{
    public const string Cookie = "nhn_dotnet_session";
    private readonly Dictionary<string, LocalSession> sessions = [];
    private DateTimeOffset window = clock.GetUtcNow();
    private int requests, integrations;
    private readonly object gate = new();

    public async Task Invoke(HttpContext context, RequestDelegate next)
    {
        var headers = context.Response.Headers;
        headers.CacheControl = "no-store";
        headers["X-Content-Type-Options"] = "nosniff";
        headers["Referrer-Policy"] = "no-referrer";
        headers["X-Frame-Options"] = "DENY";
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        headers["Cross-Origin-Resource-Policy"] = "same-origin";
        headers["Cross-Origin-Opener-Policy"] = "same-origin";
        headers.ContentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
        var request = context.Request;
        var hosts = new[] { $"localhost:{options.Port}", $"127.0.0.1:{options.Port}", $"[::1]:{options.Port}" };
        if (!hosts.Contains(request.Host.Value, StringComparer.OrdinalIgnoreCase)) throw new IntegrationException("Ukjent vertsnavn.", 403);
        var origin = request.Headers.Origin.ToString();
        if ((origin.Length > 0 && !hosts.Any(h => origin.Equals($"http://{h}", StringComparison.OrdinalIgnoreCase)))
            || request.Headers["Sec-Fetch-Site"] == "cross-site")
            throw new IntegrationException("Forespørselen må komme fra testklienten.", 403);
        lock (gate)
        {
            var now = clock.GetUtcNow();
            if (now - window >= TimeSpan.FromMinutes(1)) { window = now; requests = integrations = 0; }
            if (++requests > 240 || ((request.Path.StartsWithSegments("/api/auth") || request.Path == "/api/tasks/send") && ++integrations > 20))
            {
                headers.RetryAfter = Math.Max(1, (int)Math.Ceiling((window.AddMinutes(1) - now).TotalSeconds)).ToString(System.Globalization.CultureInfo.InvariantCulture);
                throw new IntegrationException("For mange forespørsler. Vent ett minutt og prøv igjen.", 429);
            }
            if (request.Path.StartsWithSegments("/api") && !(HttpMethods.IsGet(request.Method) && request.Path == "/api/schema"))
            {
                foreach (var expired in sessions.Where(p => p.Value.Expires <= now).Select(p => p.Key).ToArray()) sessions.Remove(expired);
                var id = request.Cookies[Cookie] ?? "";
                if (!sessions.TryGetValue(id, out var session))
                {
                    if (!HttpMethods.IsGet(request.Method)) throw new IntegrationException("Økten er utløpt. Last siden på nytt.", 403);
                    if (sessions.Count >= 100) throw new IntegrationException("For mange økter. Prøv igjen senere.", 429);
                    id = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
                    session = new(now.AddMinutes(30));
                    sessions.Add(id, session);
                    context.Response.Cookies.Append(Cookie, id, new() { HttpOnly = true, SameSite = SameSiteMode.Strict, Path = "/api", MaxAge = TimeSpan.FromMinutes(30), Secure = request.IsHttps });
                }
                if (!HttpMethods.IsGet(request.Method) && request.Headers["X-CSRF-Token"] != session.Csrf)
                    throw new IntegrationException("Ugyldig økttoken. Last siden på nytt.", 403);
                context.Items[typeof(LocalSession)] = session;
            }
        }
        await next(context);
    }
    public static LocalSession Session(HttpContext context) => (LocalSession)context.Items[typeof(LocalSession)]!;
}
