using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Testklient;

public partial class Program
{
    public static async Task<int> Main(string[] args)
    {
        try
        {
            var app = Application.Build(args);
            var options = app.Services.GetRequiredService<LocalOptions>();
            app.Lifetime.ApplicationStarted.Register(() => Console.WriteLine($"Testklient (.NET): http://localhost:{options.Port} · Helsenorge Test01 / Test02"));
            await app.RunAsync(); return 0;
        }
        catch (IOException)
        {
            Console.Error.WriteLine("Kunne ikke starte: porten er allerede i bruk. Stopp den gamle kjøringen med Ctrl+C, eller velg en annen PORT og tilsvarende APP_ORIGIN i dotnet/.env.");
            return 1;
        }
        catch (Exception e) when (e is InvalidOperationException or UnauthorizedAccessException)
        {
            // Do not print exception details that could contain configuration or keys.
            Console.Error.WriteLine("Kunne ikke starte .NET-testklienten. Kontroller lokalt oppsett, port og filtilgang. Se dotnet/README.md.");
            return 1;
        }
    }
}

namespace Testklient
{
    public static class Application
    {
        public static WebApplication Build(string[] args, string? root = null, Action<WebApplicationBuilder>? customize = null, string? webRoot = null)
        {
            root ??= LocalFiles.FindRoot();
            webRoot ??= Directory.Exists(Path.Combine(root, "wwwroot")) ? Path.Combine(root, "wwwroot") : Path.Combine(root, "frontend", "dist");
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args, ContentRootPath = root, WebRootPath = webRoot });
            builder.Configuration.AddInMemoryCollection(LocalFiles.ReadEnv(root)).AddEnvironmentVariables();
            builder.Logging.ClearProviders(); // No request/payload/exception logging containing test identifiers or secrets.
            var local = LocalOptions.Read(builder.Configuration, root);
            builder.WebHost.UseUrls(local.ListenUrl);
            builder.WebHost.ConfigureKestrel(k => { k.AddServerHeader = false; k.Limits.MaxRequestBodySize = 2 * 1024 * 1024; });
            builder.Services.AddSingleton(local);
            builder.Services.AddSingleton(TimeProvider.System);
            builder.Services.AddSingleton(HelseIdOptions.Read(builder.Configuration, root));
            builder.Services.AddSingleton(new HttpClient(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) {
                Timeout = TimeSpan.FromSeconds(20), MaxResponseContentBufferSize = 1024 * 1024
            });
            builder.Services.AddSingleton<IHelseIdClientFactory, HelseIdClientFactory>();
            builder.Services.AddSingleton<ConnectionSettings>();
            builder.Services.AddSingleton<LocalSecurity>();
            builder.Services.AddSingleton<FhirService>();
            customize?.Invoke(builder);
            var app = builder.Build();
            _ = app.Services.GetRequiredService<ConnectionSettings>(); // Validate local settings before accepting traffic.
            _ = app.Services.GetRequiredService<FhirService>().Schema(); // Initialize Firely metadata before the first import.
            app.Use(async (context, next) => {
                try { await next(context); }
                catch (IntegrationException e)
                {
                    context.Response.StatusCode = e.Status;
                    await context.Response.WriteAsJsonAsync(new { error = e.Message, code = e.Code, fields = e.Fields });
                }
                catch (BadHttpRequestException e)
                {
                    context.Response.StatusCode = e.StatusCode;
                    await context.Response.WriteAsJsonAsync(new { error = "Ugyldig eller for stor forespørsel (maksimalt 2 MB)." });
                }
                catch
                {
                    context.Response.StatusCode = 502;
                    await context.Response.WriteAsJsonAsync(new { error = "Tjenestekallet kunne ikke fullføres. Kontroller nettverk, HelseID-oppsett og tilgjengeligheten til testmiljøet." });
                }
            });
            app.Use((context, next) => app.Services.GetRequiredService<LocalSecurity>().Invoke(context, next));
            app.MapGet("/api/config", (HttpContext context, ConnectionSettings settings) => Results.Json(new {
                environment = "test02", endpoint = Targets.Find("test02").Endpoint, environments = Targets.Environments,
                csrf = LocalSecurity.Session(context).Csrf, auth = settings.Status()
            }));
            app.MapGet("/api/schema", (FhirService fhir) => Results.Json(fhir.Schema()));
            app.MapPost("/api/auth/settings", async (HttpContext context, ConnectionSettings settings) => Results.Json(await settings.Save(await ReadBody(context))));
            app.MapPost("/api/auth/connect", async (HttpContext context, ConnectionSettings settings) => {
                await ReadBody(context);
                using var lease = settings.Begin();
                await lease.Client.GetToken();
                return Results.Json(lease.Client.Status());
            });
            app.MapPost("/api/tasks/import", async (HttpContext context, FhirService fhir) => {
                var body = await ReadBody(context);
                return Results.Json(new { task = fhir.Import(body.Text("text")) });
            });
            app.MapPost("/api/tasks/validate", async (HttpContext context, FhirService fhir) => {
                var body = await ReadBody(context);
                var issues = fhir.Validate(body.At("task"));
                return Results.Json(new { valid = !issues.Any(i => i.Severity == "error"), issues });
            });
            app.MapPost("/api/tasks/send", Send);
            app.Map("/api/{**path}", () => Results.Json(new { error = "Ukjent API-rute." }, statusCode: 404));
            if (Directory.Exists(webRoot)) { app.UseDefaultFiles(); app.UseStaticFiles(); }
            app.MapGet("/", () => File.Exists(Path.Combine(webRoot, "index.html"))
                ? Results.File(Path.Combine(webRoot, "index.html"), "text/html; charset=utf-8")
                : Results.Json(new { error = "Bygg frontend først: cd dotnet/frontend, npm ci --ignore-scripts, npm run build. Start deretter serveren på nytt." }, statusCode: 503));
            return app;
        }

        private static async Task<IResult> Send(HttpContext context, ConnectionSettings settings, FhirService fhir)
        {
            var body = await ReadBody(context);
            var environment = Targets.Find(body.Text("environment"));
            var task = body.At("task");
            var issues = fhir.Validate(task);
            if (issues.Any(i => i.Severity == "error")) return Results.Json(new { error = "Oppgaven har valideringsfeil.", issues }, statusCode: 422);
            if (!body.At("confirmTestData").IsTrue()) return Results.Json(new { error = "Bekreft at oppgaven bruker testdata før innsending." }, statusCode: 400);
            using var lease = settings.Begin();
            var identifier = task.At("identifier").Items().First(i => i.Text("system") == TaskRules.UuidSystem).Text("value");
            var key = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new[] { environment.Id, identifier }))));
            var session = LocalSecurity.Session(context);
            session.Reserve(key);
            try
            {
                var response = await lease.Client.SendTask(task!, Guid.NewGuid().ToString(), environment.Id);
                if (!response.Ok && !response.DeliveryUnknown) session.Release(key);
                return Results.Json(response, statusCode: response.Ok ? 200 : 502);
            }
            catch (IntegrationException e) when (e.Code != "delivery_unknown") { session.Release(key); throw; }
            catch (IntegrationException) { throw; }
            catch { throw new IntegrationException("Leveringsstatus er ukjent. Kontroller Helsenorge før du prøver igjen.", 502, "delivery_unknown"); }
            // Unknown/unexpected failures conservatively retain the reservation.
        }

        private static async Task<JsonNode> ReadBody(HttpContext context)
        {
            if (context.Request.ContentType?.Split(';')[0].Trim() != "application/json")
                throw new IntegrationException("Forespørselen må være JSON.", 415);
            const int maximum = 2 * 1024 * 1024;
            if (context.Request.ContentLength > maximum) throw new IntegrationException("Forespørselen er for stor (maksimalt 2 MB).", 413);
            using var buffer = new MemoryStream();
            var part = new byte[8192];
            int count;
            while ((count = await context.Request.Body.ReadAsync(part)) > 0)
            {
                if (buffer.Length + count > maximum) throw new IntegrationException("Forespørselen er for stor (maksimalt 2 MB).", 413);
                buffer.Write(part, 0, count);
            }
            try
            {
                return JsonNode.Parse(buffer.ToArray(), documentOptions: new JsonDocumentOptions { MaxDepth = 48 }) is JsonObject body
                    ? body : throw new JsonException();
            }
            catch (JsonException) { throw new IntegrationException("Ugyldig JSON i forespørselen.", 400); }
        }
    }
}
