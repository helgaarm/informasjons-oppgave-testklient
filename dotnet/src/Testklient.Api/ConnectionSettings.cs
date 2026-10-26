using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Testklient;

public interface IHelseIdClientFactory { IHelseIdClient Create(HelseIdOptions options); }

public sealed class HelseIdClientFactory(HttpClient http, TimeProvider clock) : IHelseIdClientFactory
{
    private readonly string automaticClientId = Guid.NewGuid().ToString();
    public IHelseIdClient Create(HelseIdOptions options) => new HelseIdClient(options, http, automaticClientId, clock);
}

public sealed class ConnectionSettings : IDisposable
{
    private static readonly Dictionary<string, (string Label, int Max)> Fields = new() {
        ["apiKey"] = ("API-nøkkel", 8192), ["audience"] = ("API-mottaker (audience)", 512),
        ["scope"] = ("Tilgang (scope)", 2048), ["parent"] = ("Organisasjonsnummer", 9), ["child"] = ("Underenhet", 9)
    };
    private readonly object gate = new();
    private readonly string directory;
    private readonly IHelseIdClientFactory factory;
    private HelseIdOptions current;
    private IHelseIdClient client;
    private int active;
    private bool saving;

    public ConnectionSettings(HelseIdOptions initial, LocalOptions local, IHelseIdClientFactory factory)
    {
        this.factory = factory; directory = Path.Combine(local.Root, "secrets"); current = initial;
        var file = Path.Combine(directory, "connection.json");
        if (initial.Mode == "test-token" && File.Exists(file))
        {
            try
            {
                if (new FileInfo(file).Length > 20_000) throw new FormatException();
                current = Validate(JsonNode.Parse(File.ReadAllText(file)), initial with { ApiKey = "" });
            }
            catch { throw new InvalidOperationException("Det lokale tilkoblingsoppsettet i secrets/connection.json er ugyldig eller kunne ikke leses. Rett eller fjern filen og start på nytt."); }
        }
        client = factory.Create(current);
    }

    public JsonObject Status() { lock (gate) return client.Status(); }

    public RequestLease Begin()
    {
        lock (gate)
        {
            if (saving) throw new IntegrationException("Vent til oppsettet er lagret.", 409, "settings_busy");
            active++;
            return new RequestLease(client, () => { lock (gate) active--; });
        }
    }

    public static HelseIdOptions Validate(JsonNode? input, HelseIdOptions current)
    {
        if (input is not JsonObject obj || obj.Any(pair => !Fields.ContainsKey(pair.Key)))
            throw new IntegrationException("Oppsettet inneholder ukjente felt.", 400, "invalid_settings");
        var errors = new Dictionary<string, string>();
        var values = new Dictionary<string, string>();
        foreach (var (name, definition) in Fields)
        {
            var value = obj[name] is null ? "" : obj[name].Text();
            if (value is null || value.Length > definition.Max || value.Any(c => c < 32 || c == 127))
            {
                errors[name] = $"Kontroller {definition.Label.ToLowerInvariant()}. Verdien er ugyldig.";
                continue;
            }
            value = value.Trim();
            if (name == "apiKey" && value.Length == 0) value = current.ApiKey;
            values[name] = value;
            if (name != "child" && value.Length == 0) errors[name] = $"Fyll inn {definition.Label.ToLowerInvariant()}.";
            if (name is "parent" or "child" && value.Length > 0 && !Regex.IsMatch(value, "^[0-9]{9}$")) errors[name] = "Organisasjonsnummeret må ha ni siffer.";
        }
        if (errors.Count > 0) throw new IntegrationException("Kontroller de markerte feltene.", 400, "invalid_settings", errors);
        return current with { ApiKey = values["apiKey"], Audience = values["audience"], Scope = values["scope"], Parent = values["parent"], Child = values["child"] };
    }

    public async Task<JsonObject> Save(JsonNode? input)
    {
        HelseIdOptions next;
        lock (gate)
        {
            if (current.Mode != "test-token") throw new IntegrationException("Dette skjemaet er bare tilgjengelig for test-token-tjenesten.", 400, "unsupported_auth_mode");
            if (saving || active > 0) throw new IntegrationException("Vent til pågående lagring, tilkoblingstest eller innsending er ferdig.", 409, "settings_busy");
            next = Validate(input, current); saving = true;
        }
        IHelseIdClient? replacement = null;
        var temporary = Path.Combine(directory, $"connection-{Guid.NewGuid()}.tmp");
        try
        {
            replacement = factory.Create(next);
            if (OperatingSystem.IsWindows()) Directory.CreateDirectory(directory);
            else Directory.CreateDirectory(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            var streamOptions = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write, Share = FileShare.None };
            if (!OperatingSystem.IsWindows()) streamOptions.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
            await using (var stream = new FileStream(temporary, streamOptions))
                await System.Text.Json.JsonSerializer.SerializeAsync(stream, new { apiKey = next.ApiKey, audience = next.Audience, scope = next.Scope, parent = next.Parent, child = next.Child });
            File.Move(temporary, Path.Combine(directory, "connection.json"), true);
            lock (gate) { client.Dispose(); client = replacement; replacement = null; current = next; return client.Status(); }
        }
        catch { throw new IntegrationException("Kunne ikke lagre oppsettet lokalt. Kontroller at appen har skrivetilgang til secrets-mappen, og prøv igjen.", 500, "settings_write_failed"); }
        finally
        {
            replacement?.Dispose();
            try { File.Delete(temporary); } catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
            lock (gate) saving = false;
        }
    }
    public void Dispose() { client.Dispose(); }

    public sealed class RequestLease(IHelseIdClient client, Action release) : IDisposable
    {
        public IHelseIdClient Client { get; } = client;
        private Action? onDispose = release;
        public void Dispose() => Interlocked.Exchange(ref onDispose, null)?.Invoke();
    }
}
