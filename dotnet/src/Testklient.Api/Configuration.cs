using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Testklient;

public sealed class IntegrationException(string message, int status = 502, string code = "integration_error",
    IReadOnlyDictionary<string, string>? fields = null) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public IReadOnlyDictionary<string, string>? Fields { get; } = fields;
}

public sealed record TestEnvironment(string Id, string Label, string Endpoint, string PortalUrl, string Description);

public static class Targets
{
    public const string Issuer = "https://helseid-sts.test.nhn.no";
    public const string TestToken = "https://helseid-ttt.test.nhn.no/v2/create-test-token-with-key";
    public static readonly TestEnvironment[] Environments = [
        new("test01", "Test01", "https://eksternapi.hn.test.nhn.no/oppgave/v1/Task", "https://tjenester.hn.test.nhn.no/",
            "For testing av ny funksjonalitet. Kan være mindre stabilt enn Test02."),
        new("test02", "Test02", "https://eksternapi.hn2.test.nhn.no/oppgave/v1/Task", "https://tjenester.hn2.test.nhn.no/",
            "Vanlig område for integrasjonstesting mot gjeldende tjenester.")
    ];
    public static TestEnvironment Find(string? id) => Environments.FirstOrDefault(e => e.Id == id)
        ?? throw new IntegrationException("Velg Test01 eller Test02 før innsending.", 400, "invalid_environment");
}

public sealed record HelseIdOptions
{
    public string Mode { get; init; } = "test-token";
    public string ApiKey { get; init; } = "";
    public string Audience { get; init; } = "";
    public string Scope { get; init; } = "";
    public string Parent { get; init; } = "";
    public string Child { get; init; } = "";
    public string TestClientId { get; init; } = "";
    public string ClientId { get; init; } = "";
    public string KeyFile { get; init; } = "";
    public string KeyId { get; init; } = "";
    public string Algorithm { get; init; } = "PS256";
    public bool MultiTenant { get; init; }

    public static HelseIdOptions Read(IConfiguration config, string root)
    {
        string Get(string name) => config[name]?.Trim() ?? "";
        var keyFile = Get("HELSEID_PRIVATE_KEY_FILE");
        var options = new HelseIdOptions {
            Mode = Get("HELSEID_AUTH_MODE") is { Length: > 0 } mode ? mode : Get("HELSEID_CLIENT_ID").Length > 0 ? "client_credentials" : "test-token",
            ApiKey = Get("HELSEID_TTT_API_KEY"), Audience = Get("HELSEID_TTT_AUDIENCE"), Scope = Get("HELSEID_SCOPE"),
            Parent = Get("HELSEID_ORGNR_PARENT"), Child = Get("HELSEID_ORGNR_CHILD"), TestClientId = Get("HELSEID_TTT_CLIENT_ID").ToLowerInvariant(),
            ClientId = Get("HELSEID_CLIENT_ID"), KeyId = Get("HELSEID_KEY_ID"),
            KeyFile = keyFile.Length > 0 ? Path.GetFullPath(keyFile, root) : "",
            Algorithm = Get("HELSEID_SIGNING_ALG") is { Length: > 0 } algorithm ? algorithm : "PS256",
            MultiTenant = Get("HELSEID_MULTI_TENANT") == "true"
        };
        if (options.Mode is not ("test-token" or "client_credentials"))
            throw new InvalidOperationException("HELSEID_AUTH_MODE må være test-token eller client_credentials.");
        return options;
    }

    public string[] Missing() => (Mode == "test-token"
        ? new[] { (ApiKey, "HELSEID_TTT_API_KEY"), (Audience, "HELSEID_TTT_AUDIENCE"), (Scope, "HELSEID_SCOPE"), (Parent, "HELSEID_ORGNR_PARENT") }
        : new[] { (ClientId, "HELSEID_CLIENT_ID"), (Scope, "HELSEID_SCOPE"), (KeyFile, "HELSEID_PRIVATE_KEY_FILE"), (MultiTenant ? Parent : "unused", "HELSEID_ORGNR_PARENT") })
        .Where(pair => string.IsNullOrEmpty(pair.Item1)).Select(pair => pair.Item2).ToArray();
}

public sealed record LocalOptions(string Root, int Port, string Host, Uri Origin)
{
    public static LocalOptions Read(IConfiguration config, string root)
    {
        var host = config["HOST"] ?? "127.0.0.1";
        if (host is not ("127.0.0.1" or "localhost" or "::1"))
            throw new InvalidOperationException("Denne enkeltbrukerklienten må bindes til loopback. Bruk lokal kjøring eller SSH-tunnel.");
        if (!int.TryParse(config["PORT"] ?? "3001", out var port) || port is < 1 or > 65535)
            throw new InvalidOperationException("PORT må være mellom 1 og 65535.");
        if (!Uri.TryCreate(config["APP_ORIGIN"] ?? $"http://localhost:{port}", UriKind.Absolute, out var origin)
            || origin.Scheme != "http" || !origin.IsLoopback || origin.Port != port || origin.AbsolutePath != "/"
            || origin.UserInfo.Length > 0 || origin.Query.Length > 0 || origin.Fragment.Length > 0)
            throw new InvalidOperationException("APP_ORIGIN må være en lokal http-adresse med samme port som PORT.");
        return new(root, port, host, origin);
    }

    public string ListenUrl => $"http://{(Host == "::1" ? "[::1]" : "127.0.0.1")}:{Port}";
}

public static class LocalFiles
{
    public static string FindRoot()
    {
        // A published app owns its configuration even when launched from the checkout.
        if (File.Exists(Path.Combine(AppContext.BaseDirectory, "wwwroot", "index.html"))) return AppContext.BaseDirectory;
        foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
            for (var dir = new DirectoryInfo(start); dir is not null; dir = dir.Parent)
                if (File.Exists(Path.Combine(dir.FullName, "Testklient.slnx"))) return dir.FullName;
        return AppContext.BaseDirectory;
    }

    // Only the companion's .env is read. Process environment variables take precedence.
    public static Dictionary<string, string?> ReadEnv(string root)
    {
        var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        var file = Path.Combine(root, ".env");
        if (!File.Exists(file)) return values;
        foreach (var line in File.ReadLines(file))
        {
            var value = line.Trim();
            if (value.StartsWith('#') || !value.Contains('=')) continue;
            var parts = value.Split('=', 2);
            if (!Regex.IsMatch(parts[0].Trim(), "^[A-Z][A-Z0-9_]*$")) continue;
            values[parts[0].Trim()] = parts[1].Trim().Trim('"', '\'');
        }
        return values;
    }
}

public static class Json
{
    public static JsonNode? At(this JsonNode? node, params object[] path)
    {
        foreach (var part in path)
            node = part is int index && node is JsonArray array && index >= 0 && index < array.Count ? array[index]
                : part is string name && node is JsonObject obj ? obj[name] : null;
        return node;
    }
    public static string? Text(this JsonNode? node) => node is JsonValue v && v.TryGetValue<string>(out var value) ? value : null;
    public static string? Text(this JsonNode? node, params object[] path) => node.At(path).Text();
    public static double? Number(this JsonNode? node) => node is JsonValue v && v.TryGetValue<double>(out var value) && double.IsFinite(value) ? value : null;
    public static bool IsTrue(this JsonNode? node) => node is JsonValue v && v.TryGetValue<bool>(out var value) && value;
    public static IEnumerable<JsonNode?> Items(this JsonNode? node) => node is JsonArray a ? a : [];
}
