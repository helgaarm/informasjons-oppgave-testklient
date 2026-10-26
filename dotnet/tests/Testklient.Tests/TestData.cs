using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Testklient;

namespace Testklient.Tests;

internal static class TestData
{
    public static HelseIdOptions Options => new() { ApiKey = "synthetic-key-not-real", Audience = "synthetic-audience", Scope = "synthetic-scope", Parent = "123456789" };
    public static JsonNode Task() => JsonNode.Parse("""
        {"resourceType":"Task","meta":{"security":[{"system":"urn:oid:2.16.578.1.12.4.1.1.7618","code":"3"}]},
        "identifier":[{"system":"urn:ietf:rfc:3986","value":"urn:uuid:ebca7ce9-e781-4ada-bfea-15696db499f6"}],
        "status":"ready","intent":"proposal","code":{"text":"Synthetic information"},"description":"Synthetic test only",
        "instantiatesUri":"https://example.org/information","focus":{"type":"Communication"},
        "owner":{"type":"Patient","identifier":{"system":"urn:oid:2.16.578.1.12.4.1.4.1","value":"12345678901"}},
        "requester":{"reference":"#sender","type":"Organization"},"contained":[{"resourceType":"Organization","id":"sender","name":"Synthetic sender"}],
        "restriction":{"period":{"end":"2099-12-31"}}}
        """)!;
    public static JsonObject Submission(string environment = "test02") => new() { ["task"] = Task(), ["environment"] = environment, ["confirmTestData"] = true };
}

internal sealed class FakeState
{
    public int Calls;
    public Func<JsonNode, string, string, Task<SubmissionResult>> Send { get; set; } = (_, id, environment) => System.Threading.Tasks.Task.FromResult(
        new SubmissionResult(true, 201, new JsonObject { ["id"] = "synthetic-receipt" }, environment, null, id, false, DateTimeOffset.UtcNow));
}
internal sealed class FakeFactory(FakeState state) : IHelseIdClientFactory
{
    public IHelseIdClient Create(HelseIdOptions options) => new FakeClient(options, state);
}
internal sealed class FakeClient(HelseIdOptions options, FakeState state) : IHelseIdClient
{
    public JsonObject Status() => new() {
        ["mode"] = options.Mode, ["configured"] = options.Missing().Length == 0, ["authenticated"] = false, ["editable"] = options.Mode == "test-token",
        ["missing"] = new JsonArray(options.Missing().Select(s => JsonValue.Create(s)).ToArray()), ["audience"] = options.Audience,
        ["scope"] = options.Scope, ["parent"] = options.Parent, ["child"] = options.Child, ["clientId"] = "synthetic-client", ["issuer"] = Targets.Issuer
    };
    public Task<AccessToken> GetToken() => System.Threading.Tasks.Task.FromResult(new AccessToken("synthetic-token", DateTimeOffset.UtcNow.AddMinutes(5), options.Parent));
    public Task<SubmissionResult> SendTask(JsonNode task, string correlationId, string environmentId)
    {
        Interlocked.Increment(ref state.Calls);
        return state.Send(task, correlationId, environmentId);
    }
    public void Dispose() { }
}

internal sealed class AppHarness : IAsyncDisposable
{
    public string Root { get; } = Path.Combine(Path.GetTempPath(), "testklient-" + Guid.NewGuid());
    public FakeState State { get; } = new();
    public WebApplication App { get; private set; } = null!;
    public HttpClient Client { get; private set; } = null!;
    public JsonNode Config { get; private set; } = null!;
    public static async Task<AppHarness> Start()
    {
        var harness = new AppHarness();
        Directory.CreateDirectory(harness.Root);
        harness.App = Application.Build([], harness.Root, builder => {
            builder.WebHost.UseTestServer();
            builder.Services.AddSingleton(TestData.Options);
            builder.Services.AddSingleton<IHelseIdClientFactory>(new FakeFactory(harness.State));
        });
        await harness.App.StartAsync();
        harness.Client = harness.App.GetTestClient();
        harness.Client.BaseAddress = new Uri("http://localhost:3001");
        var response = await harness.Client.GetAsync("/api/config");
        harness.Config = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        harness.Client.DefaultRequestHeaders.Add("Cookie", response.Headers.GetValues("Set-Cookie").Single().Split(';')[0]);
        harness.Client.DefaultRequestHeaders.Add("X-CSRF-Token", harness.Config.Text("csrf"));
        return harness;
    }
    public async Task<HttpResponseMessage> Post(string path, JsonNode body) => await Client.PostAsync(path, new StringContent(body.ToJsonString(), System.Text.Encoding.UTF8, "application/json"));
    public async ValueTask DisposeAsync()
    {
        Client.Dispose(); await App.DisposeAsync();
        if (Path.GetFullPath(Root).StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase)) Directory.Delete(Root, true);
    }
}
