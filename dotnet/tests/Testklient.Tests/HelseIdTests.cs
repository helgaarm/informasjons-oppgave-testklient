using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Tokens;
using Testklient;

namespace Testklient.Tests;

internal sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> handle) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => handle(request);
}

[TestClass]
public sealed class HelseIdTests
{
    private static HttpClient Http(Func<HttpRequestMessage, Task<HttpResponseMessage>> handle) => new(new Handler(handle)) { MaxResponseContentBufferSize = 1024 * 1024, Timeout = TimeSpan.FromSeconds(20) };
    private static HttpResponseMessage Response(JsonNode body, HttpStatusCode status = HttpStatusCode.OK) => new(status) { Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json") };
    private static JsonNode Decode(string token, int part = 1) => JsonNode.Parse(Base64UrlEncoder.Decode(token.Split('.')[part]))!;
    private static string Token(JsonNode claims) => Base64UrlEncoder.Encode("{\"alg\":\"RS256\"}") + "." + Base64UrlEncoder.Encode(claims.ToJsonString()) + ".synthetic-signature";
    private static JsonObject TttClaims(JsonNode request)
    {
        var claims = request.At("clientClaimsParameters");
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        return new() {
            ["iss"] = Targets.Issuer, ["aud"] = request.Text("audience"), ["scope"] = claims!.At("scope")!.DeepClone(),
            ["client_id"] = claims.Text("clientId"), ["helseid://claims/client/client_name"] = claims.Text("clientName"),
            ["helseid://claims/client/client_tenancy"] = "single-tenant", ["client_amr"] = "private_key_jwt",
            ["jti"] = claims.Text("jti"), ["exp"] = now + 300, ["iat"] = now, ["nbf"] = now,
            ["cnf"] = new JsonObject { ["jkt"] = claims.Text("cnfJkt") },
            ["helseid://claims/client/claims/orgnr_parent"] = claims.Text("orgnrParent")
        };
    }
    private static async Task<HttpResponseMessage> Ttt(HttpRequestMessage request, Action<JsonObject>? modify = null)
    {
        Assert.AreEqual(Targets.TestToken, request.RequestUri!.AbsoluteUri);
        var payload = JsonNode.Parse(await request.Content!.ReadAsStringAsync())!;
        Assert.IsTrue(payload.At("withoutDefaultClientClaims").IsTrue());
        Assert.IsTrue(payload.At("withoutDefaultUserClaims").IsTrue());
        Assert.IsFalse(payload.At("createDPoPTokenWithDPoPProof").IsTrue());
        Assert.AreEqual(1d, payload.At("clientClaimsParameters", "clientTenancyType").Number());
        var claims = TttClaims(payload); modify?.Invoke(claims);
        return Response(new JsonObject { ["successResponse"] = new JsonObject { ["accessTokenJwt"] = Token(claims) } });
    }

    [TestMethod]
    public async Task ConcurrentTokenCallsAreCachedAndDpopNonceRetryIsBound()
    {
        var tokens = 0; var sends = 0; string? originalJkt = null;
        using var http = Http(async request => {
            if (request.RequestUri!.AbsoluteUri == Targets.TestToken) { tokens++; return await Ttt(request, claims => originalJkt = claims.Text("cnf", "jkt")); }
            Assert.AreEqual(Targets.Find("test01").Endpoint, request.RequestUri.AbsoluteUri);
            var proof = request.Headers.GetValues("DPoP").Single();
            var header = Decode(proof, 0); var claims = Decode(proof);
            Assert.AreEqual("dpop+jwt", header.Text("typ"));
            Assert.IsNull(header.At("jwk", "d"));
            var publicKey = new JsonWebKey(header["jwk"]!.ToJsonString());
            Assert.AreEqual(originalJkt, Base64UrlEncoder.Encode(publicKey.ComputeJwkThumbprint()));
            new JwtSecurityTokenHandler().ValidateToken(proof, new TokenValidationParameters {
                IssuerSigningKey = publicKey, ValidateIssuer = false, ValidateAudience = false, ValidateLifetime = false,
                RequireExpirationTime = false, ValidAlgorithms = ["PS256"]
            }, out _);
            Assert.AreEqual("POST", claims.Text("htm"));
            Assert.AreEqual(request.RequestUri.AbsoluteUri, claims.Text("htu"));
            Assert.AreEqual(Base64UrlEncoder.Encode(SHA256.HashData(Encoding.UTF8.GetBytes(request.Headers.Authorization!.Parameter!))), claims.Text("ath"));
            if (++sends == 1)
            {
                var challenge = Response(new JsonObject(), HttpStatusCode.Unauthorized);
                challenge.Headers.Add("DPoP-Nonce", "synthetic-nonce");
                challenge.Headers.Add("WWW-Authenticate", "DPoP error=\"use_dpop_nonce\"");
                return challenge;
            }
            Assert.AreEqual("synthetic-nonce", claims.Text("nonce"));
            return Response(new JsonObject(), HttpStatusCode.Created);
        });
        using var client = new HelseIdClient(TestData.Options, http, Guid.NewGuid().ToString(), TimeProvider.System);
        await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => client.GetToken()));
        Assert.AreEqual(1, tokens);
        Assert.IsTrue((await client.SendTask(TestData.Task(), Guid.NewGuid().ToString(), "test01")).Ok);
        Assert.AreEqual(2, sends);
        Assert.IsFalse(client.Status().ToJsonString().Contains(TestData.Options.ApiKey));
    }

    [TestMethod]
    [DataRow("aud")]
    [DataRow("scope")]
    [DataRow("client_id")]
    [DataRow("helseid://claims/client/client_tenancy")]
    [DataRow("client_amr")]
    [DataRow("jti")]
    [DataRow("helseid://claims/client/claims/orgnr_parent")]
    [DataRow("exp")]
    [DataRow("cnf")]
    public async Task RejectsTestTokensWithIncorrectClaims(string claim)
    {
        using var http = Http(request => Ttt(request, claims => claims[claim] = "incorrect"));
        using var client = new HelseIdClient(TestData.Options, http, Guid.NewGuid().ToString(), TimeProvider.System);
        var error = await Assert.ThrowsAsync<IntegrationException>(() => client.GetToken());
        Assert.AreEqual("invalid_test_token", error.Code);
        Assert.IsFalse(client.Status().At("authenticated").IsTrue());
    }

    [TestMethod]
    public async Task UpstreamErrorsNeverReturnRawDiagnostics()
    {
        using var http = Http(_ => Task.FromResult(Response(new JsonObject { ["error"] = "synthetic-secret-diagnostic" }, HttpStatusCode.BadRequest)));
        using var client = new HelseIdClient(TestData.Options, http, Guid.NewGuid().ToString(), TimeProvider.System);
        var error = await Assert.ThrowsAsync<IntegrationException>(() => client.GetToken());
        Assert.IsFalse(error.Message.Contains("synthetic-secret-diagnostic"));
        Assert.AreEqual("ttt_rejected", error.Code);
    }

    [TestMethod]
    public async Task TransportFailureDuringSubmissionDoesNotRetry()
    {
        var sends = 0;
        using var http = Http(async request => {
            if (request.RequestUri!.AbsoluteUri == Targets.TestToken) return await Ttt(request);
            sends++; throw new HttpRequestException("synthetic network failure");
        });
        using var client = new HelseIdClient(TestData.Options, http, Guid.NewGuid().ToString(), TimeProvider.System);
        var error = await Assert.ThrowsAsync<IntegrationException>(() => client.SendTask(TestData.Task(), Guid.NewGuid().ToString(), "test02"));
        Assert.AreEqual("delivery_unknown", error.Code); Assert.AreEqual(1, sends);
    }

    [TestMethod]
    [DataRow(false)]
    [DataRow(true)]
    public async Task FailedOrUntrustedDiscoveryNeverSendsATask(bool untrusted)
    {
        var root = Path.Combine(Path.GetTempPath(), "testklient-discovery-" + Guid.NewGuid()); Directory.CreateDirectory(root);
        using var rsa = RSA.Create(2048);
        var file = Path.Combine(root, "synthetic.pem"); await File.WriteAllTextAsync(file, rsa.ExportPkcs8PrivateKeyPem());
        try
        {
            var calls = 0;
            using var http = Http(request => {
                calls++; Assert.AreEqual(HttpMethod.Get, request.Method);
                if (!untrusted) throw new HttpRequestException("synthetic-private-diagnostic");
                return Task.FromResult(Response(new JsonObject { ["issuer"] = Targets.Issuer, ["token_endpoint"] = "https://example.org/token" }));
            });
            using var client = new HelseIdClient(TestData.Options with { Mode = "client_credentials", ClientId = "synthetic-client", KeyFile = file, KeyId = "synthetic-key-id" }, http, Guid.NewGuid().ToString(), TimeProvider.System);
            var error = await Assert.ThrowsAsync<IntegrationException>(() => client.SendTask(TestData.Task(), Guid.NewGuid().ToString(), "test02"));
            Assert.AreNotEqual("delivery_unknown", error.Code);
            Assert.IsFalse(error.Message.Contains("synthetic-private-diagnostic"));
            Assert.AreEqual(1, calls);
        }
        finally { Directory.Delete(root, true); }
    }

    [TestMethod]
    public async Task RegisteredClientUsesIssuerAudienceAndHandlesTokenNonce()
    {
        var root = Path.Combine(Path.GetTempPath(), "testklient-key-" + Guid.NewGuid()); Directory.CreateDirectory(root);
        using var rsa = RSA.Create(2048);
        var file = Path.Combine(root, "synthetic.pem"); await File.WriteAllTextAsync(file, rsa.ExportPkcs8PrivateKeyPem());
        try
        {
            var attempts = 0;
            var options = TestData.Options with { Mode = "client_credentials", ClientId = "synthetic-client", KeyFile = file, KeyId = "synthetic-key-id", MultiTenant = true, Child = "987654321" };
            using var http = Http(async request => {
                if (request.Method == HttpMethod.Get) return Response(new JsonObject { ["issuer"] = Targets.Issuer, ["token_endpoint"] = Targets.Issuer + "/connect/token" });
                var form = (await request.Content!.ReadAsStringAsync()).Split('&').Select(p => p.Split('=', 2)).ToDictionary(p => p[0], p => Uri.UnescapeDataString(p[1].Replace('+', ' ')));
                var assertion = Decode(form["client_assertion"]);
                Assert.AreEqual(Targets.Issuer, assertion.Text("aud"));
                Assert.AreEqual("NO:ORGNR:123456789:987654321", assertion.Text("authorization_details", 0, "practitioner_role", "organization", "identifier", "value"));
                var proof = request.Headers.GetValues("DPoP").Single();
                if (++attempts == 1)
                {
                    var challenge = Response(new JsonObject { ["error"] = "use_dpop_nonce" }, HttpStatusCode.BadRequest);
                    challenge.Headers.Add("DPoP-Nonce", "synthetic-token-nonce"); return challenge;
                }
                Assert.AreEqual("synthetic-token-nonce", Decode(proof).Text("nonce"));
                var jwk = new JsonWebKey(Decode(proof, 0)["jwk"]!.ToJsonString());
                var claims = new JsonObject { ["cnf"] = new JsonObject { ["jkt"] = Base64UrlEncoder.Encode(jwk.ComputeJwkThumbprint()) },
                    ["helseid://claims/client/claims/orgnr_parent"] = "123456789", ["exp"] = DateTimeOffset.UtcNow.AddMinutes(5).ToUnixTimeSeconds() };
                return Response(new JsonObject { ["token_type"] = "DPoP", ["expires_in"] = 300, ["access_token"] = Token(claims) });
            });
            using var client = new HelseIdClient(options, http, Guid.NewGuid().ToString(), TimeProvider.System);
            Assert.AreEqual("123456789", (await client.GetToken()).Organization);
            Assert.AreEqual(2, attempts);
        }
        finally { Directory.Delete(root, true); }
    }
}
