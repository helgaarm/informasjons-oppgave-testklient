using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using Testklient;

// Separate test-only executable. Production has no mock mode or test control routes.
var port = int.Parse(args[0]);
var root = Path.GetFullPath(args[1]);
var assets = Path.GetFullPath(args[2]);
var state = new BrowserState();
var options = new HelseIdOptions { ApiKey = "synthetic-key-not-real", Audience = "synthetic-audience", Scope = "synthetic-scope", Parent = "123456789" };
var app = Testklient.Application.Build([], root, builder => {
    builder.WebHost.UseUrls($"http://127.0.0.1:{port}");
    builder.Services.AddSingleton(new LocalOptions(root, port, "127.0.0.1", new Uri($"http://127.0.0.1:{port}")));
    builder.Services.AddSingleton(options);
    builder.Services.AddSingleton<IHelseIdClientFactory>(new BrowserFactory(state));
    builder.Services.AddSingleton(new HttpClient(new NoNetwork()));
}, assets);
app.MapGet("/__test/state", () => Results.Json(state.Calls.ToArray()));
app.MapPost("/__test/state", async (HttpContext context) => {
    var body = await context.Request.ReadFromJsonAsync<JsonObject>();
    state.Reject = body.At("reject").IsTrue();
    return Results.Ok();
});
app.MapGet("/__test/ready", () => Results.Ok());
await app.RunAsync();

sealed class BrowserState
{
    public volatile bool Reject;
    public ConcurrentQueue<object> Calls { get; } = new();
}
sealed class BrowserFactory(BrowserState state) : IHelseIdClientFactory
{
    public IHelseIdClient Create(HelseIdOptions options) => new BrowserClient(state, options);
}
sealed class BrowserClient(BrowserState state, HelseIdOptions options) : IHelseIdClient
{
    public JsonObject Status() => new() {
        ["mode"] = "test-token", ["configured"] = true, ["authenticated"] = false, ["editable"] = true,
        ["missing"] = new JsonArray(), ["scope"] = options.Scope, ["audience"] = options.Audience,
        ["parent"] = options.Parent, ["child"] = options.Child, ["clientId"] = "synthetic-client", ["issuer"] = Targets.Issuer
    };
    public Task<AccessToken> GetToken() => throw new InvalidOperationException("Authentication must not be called in browser regressions.");
    public Task<SubmissionResult> SendTask(JsonNode task, string id, string environment)
    {
        state.Calls.Enqueue(new { task = task.DeepClone(), environment });
        return Task.FromResult(new SubmissionResult(!state.Reject, state.Reject ? 422 : 201,
            state.Reject ? new JsonObject { ["error"] = "Synthetic rejection" } : new JsonObject { ["id"] = "synthetic-receipt" },
            environment, null, id, false, DateTimeOffset.UtcNow));
    }
    public void Dispose() { }
}
sealed class NoNetwork : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        => throw new InvalidOperationException("External HTTP is forbidden in browser regressions.");
}
