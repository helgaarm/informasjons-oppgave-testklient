using System.Net;
using System.Text.Json.Nodes;
using Testklient;

[assembly: Parallelize(Scope = ExecutionScope.MethodLevel)]

namespace Testklient.Tests;

[TestClass]
public sealed class ApiTests
{
    [TestMethod]
    public async Task ConfigDoesNotExposeSecretsAndStaticPathsAreClosed()
    {
        await using var app = await AppHarness.Start();
        Assert.IsFalse(app.Config.ToJsonString().Contains(TestData.Options.ApiKey));
        Assert.AreEqual(2, app.Config["environments"]!.AsArray().Count);
        foreach (var path in new[] { "/.env", "/secrets/connection.json", "/src/Testklient.Api/Program.cs", "/api/no-such-route" })
            Assert.AreEqual(HttpStatusCode.NotFound, (await app.Client.GetAsync(path)).StatusCode);
        var response = await app.Client.GetAsync("/api/config");
        Assert.IsTrue(response.Headers.GetValues("Content-Security-Policy").Single().Contains("frame-ancestors 'none'"));
        Assert.IsFalse(response.Headers.Contains("Server"));
    }

    [TestMethod]
    [DataRow("Origin", "https://example.org")]
    [DataRow("Host", "example.org:3001")]
    [DataRow("Sec-Fetch-Site", "cross-site")]
    [DataRow("X-CSRF-Token", "incorrect")]
    public async Task RejectsUntrustedBrowserRequests(string header, string value)
    {
        await using var app = await AppHarness.Start();
        app.Client.DefaultRequestHeaders.Remove(header);
        app.Client.DefaultRequestHeaders.Add(header, value);
        Assert.AreEqual(HttpStatusCode.Forbidden, (await app.Post("/api/tasks/send", TestData.Submission())).StatusCode);
        Assert.AreEqual(0, app.State.Calls);
    }

    [TestMethod]
    public async Task RequiresSessionAndConfirmationAndFixedEnvironment()
    {
        await using var app = await AppHarness.Start();
        var task = TestData.Submission(); task["confirmTestData"] = false;
        Assert.AreEqual(HttpStatusCode.BadRequest, (await app.Post("/api/tasks/send", task)).StatusCode);
        Assert.AreEqual(HttpStatusCode.BadRequest, (await app.Post("/api/tasks/send", TestData.Submission("prod"))).StatusCode);
        task = TestData.Submission(); task["task"]!["status"] = "completed";
        Assert.AreEqual(HttpStatusCode.UnprocessableEntity, (await app.Post("/api/tasks/send", task)).StatusCode);
        app.Client.DefaultRequestHeaders.Remove("Cookie");
        Assert.AreEqual(HttpStatusCode.Forbidden, (await app.Post("/api/tasks/send", TestData.Submission())).StatusCode);
        Assert.AreEqual(0, app.State.Calls);
    }

    [TestMethod]
    public async Task DuplicateGuardIsPerEnvironment()
    {
        await using var app = await AppHarness.Start();
        Assert.AreEqual(HttpStatusCode.OK, (await app.Post("/api/tasks/send", TestData.Submission())).StatusCode);
        Assert.AreEqual(HttpStatusCode.Conflict, (await app.Post("/api/tasks/send", TestData.Submission())).StatusCode);
        Assert.AreEqual(HttpStatusCode.OK, (await app.Post("/api/tasks/send", TestData.Submission("test01"))).StatusCode);
        Assert.AreEqual(2, app.State.Calls);
    }

    [TestMethod]
    [DataRow(true)]
    [DataRow(false)]
    public async Task UnknownDeliveryRemainsBlocked(bool exception)
    {
        await using var app = await AppHarness.Start();
        app.State.Send = (_, id, env) => exception
            ? throw new IntegrationException("Unknown", 502, "delivery_unknown")
            : Task.FromResult(new SubmissionResult(false, 500, null, env, null, id, true, DateTimeOffset.UtcNow));
        Assert.AreEqual(HttpStatusCode.BadGateway, (await app.Post("/api/tasks/send", TestData.Submission())).StatusCode);
        Assert.AreEqual(HttpStatusCode.Conflict, (await app.Post("/api/tasks/send", TestData.Submission())).StatusCode);
        Assert.AreEqual(1, app.State.Calls);
    }

    [TestMethod]
    public async Task DefinitiveRejectionCanBeCorrectedAndRetried()
    {
        await using var app = await AppHarness.Start();
        app.State.Send = (_, id, env) => Task.FromResult(new SubmissionResult(false, 422, null, env, null, id, false, DateTimeOffset.UtcNow));
        Assert.AreEqual(HttpStatusCode.BadGateway, (await app.Post("/api/tasks/send", TestData.Submission())).StatusCode);
        Assert.AreEqual(HttpStatusCode.BadGateway, (await app.Post("/api/tasks/send", TestData.Submission())).StatusCode);
        Assert.AreEqual(2, app.State.Calls);
    }

    [TestMethod]
    public async Task ConcurrentDuplicateAndSettingsAreBlocked()
    {
        await using var app = await AppHarness.Start();
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var finish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        app.State.Send = async (_, id, env) => { started.SetResult(); await finish.Task; return new(true, 201, null, env, null, id, false, DateTimeOffset.UtcNow); };
        var first = app.Post("/api/tasks/send", TestData.Submission());
        await started.Task.WaitAsync(TimeSpan.FromSeconds(10));
        try
        {
            Assert.AreEqual(HttpStatusCode.Conflict, (await app.Post("/api/tasks/send", TestData.Submission())).StatusCode);
            Assert.AreEqual(HttpStatusCode.Conflict, (await app.Post("/api/auth/settings", Settings())).StatusCode);
        }
        finally { finish.SetResult(); }
        Assert.AreEqual(HttpStatusCode.OK, (await first).StatusCode);
        Assert.AreEqual(1, app.State.Calls);
    }

    private static JsonObject Settings() => new() { ["apiKey"] = "", ["audience"] = "synthetic-audience", ["scope"] = "synthetic-scope", ["parent"] = "987654321", ["child"] = "" };

    [TestMethod]
    public async Task SavingPreservesBlankKeyAndNeverReturnsIt()
    {
        await using var app = await AppHarness.Start();
        var response = await app.Post("/api/auth/settings", Settings());
        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.IsFalse((await response.Content.ReadAsStringAsync()).Contains(TestData.Options.ApiKey));
        var saved = JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(app.Root, "secrets", "connection.json")));
        Assert.AreEqual(TestData.Options.ApiKey, saved.Text("apiKey"));
        Assert.AreEqual("987654321", saved.Text("parent"));
        var invalid = Settings(); invalid["endpoint"] = "https://example.org/";
        Assert.AreEqual(HttpStatusCode.BadRequest, (await app.Post("/api/auth/settings", invalid)).StatusCode);
    }

    [TestMethod]
    public async Task RateLimitCannotBeResetByForwardingHeaders()
    {
        await using var app = await AppHarness.Start();
        for (var i = 0; i < 20; i++)
        {
            app.Client.DefaultRequestHeaders.Remove("X-Forwarded-For");
            app.Client.DefaultRequestHeaders.Add("X-Forwarded-For", $"192.0.2.{i}");
            Assert.AreEqual(HttpStatusCode.OK, (await app.Post("/api/auth/connect", new JsonObject())).StatusCode);
        }
        var limited = await app.Post("/api/auth/connect", new JsonObject());
        Assert.AreEqual(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.IsTrue(limited.Headers.RetryAfter?.Delta > TimeSpan.Zero);
    }

    [TestMethod]
    public async Task OversizedBodyAndMalformedJsonAreRejected()
    {
        await using var app = await AppHarness.Start();
        Assert.AreEqual(HttpStatusCode.RequestEntityTooLarge, (await app.Post("/api/tasks/import", new JsonObject { ["text"] = new string('x', 2 * 1024 * 1024) })).StatusCode);
        var invalid = new StringContent("{", System.Text.Encoding.UTF8, "application/json");
        Assert.AreEqual(HttpStatusCode.BadRequest, (await app.Client.PostAsync("/api/tasks/import", invalid)).StatusCode);
    }
}
