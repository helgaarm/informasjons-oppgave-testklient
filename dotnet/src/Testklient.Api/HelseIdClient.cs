using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.IdentityModel.Tokens;

namespace Testklient;

public sealed record AccessToken(string Value, DateTimeOffset ExpiresAt, string Organization);
public sealed record SubmissionResult(bool Ok, int Status, JsonNode? Body, string Environment, string? Location,
    string CorrelationId, bool DeliveryUnknown, DateTimeOffset ReceivedAt);

public interface IHelseIdClient : IDisposable
{
    JsonObject Status();
    Task<AccessToken> GetToken();
    Task<SubmissionResult> SendTask(JsonNode task, string correlationId, string environmentId);
}

public sealed class HelseIdClient(HelseIdOptions options, HttpClient http, string automaticClientId, TimeProvider clock) : IHelseIdClient
{
    private const string ClientName = "Informasjonsoppgave testklient";
    private const string OrgClaim = "helseid://claims/client/claims/orgnr_parent";
    private const string ChildClaim = "helseid://claims/client/claims/orgnr_child";
    private readonly string testClientId = options.TestClientId.Length > 0 ? options.TestClientId : automaticClientId;
    private readonly SemaphoreSlim tokenGate = new(1);
    private readonly object signingGate = new();
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, string> apiNonces = new();
    private AccessToken? token;
    private SecurityKey? key;
    private IDisposable? privateKey;
    private Dictionary<string, object> publicKey = [];
    private string algorithm = options.Mode == "test-token" ? "PS256" : options.Algorithm;
    private string? keyId, tokenNonce, tokenEndpoint;
    private bool Active => token is { } value && value.ExpiresAt > clock.GetUtcNow().AddSeconds(30);

    public JsonObject Status()
    {
        var missing = options.Missing();
        var current = token;
        var active = current is not null && current.ExpiresAt > clock.GetUtcNow().AddSeconds(30);
        var status = new JsonObject {
            ["mode"] = options.Mode, ["configured"] = missing.Length == 0,
            ["missing"] = new JsonArray(missing.Select(m => JsonValue.Create(m)).ToArray()),
            ["authenticated"] = active, ["issuer"] = Targets.Issuer,
            ["clientId"] = options.Mode == "test-token" ? testClientId : options.ClientId, ["scope"] = options.Scope,
            ["expiresAt"] = active ? current!.ExpiresAt.ToString("O") : null,
            ["organization"] = active ? current!.Organization : null, ["tokenType"] = active ? "DPoP" : null,
            ["editable"] = options.Mode == "test-token"
        };
        if (options.Mode == "test-token")
        {
            status["audience"] = options.Audience; status["parent"] = options.Parent; status["child"] = options.Child;
            status["clientTenancy"] = "single-tenant";
        }
        return status;
    }

    private void LoadKey()
    {
        if (key is not null) return;
        if (options.Mode == "test-token")
        {
            var rsa = RSA.Create(2048);
            privateKey = rsa;
            key = new RsaSecurityKey(rsa);
        }
        else
        {
            if (!new[] { "PS256", "PS384", "PS512", "RS256", "RS384", "RS512", "ES256", "ES384", "ES512" }.Contains(algorithm))
                throw new IntegrationException("Ugyldig signeringsalgoritme i konfigurasjonen.", 503, "invalid_configuration");
            try
            {
                var source = File.ReadAllText(options.KeyFile);
                if (source.TrimStart().StartsWith('{'))
                {
                    var jwk = new JsonWebKey(source);
                    if (string.IsNullOrEmpty(jwk.D) || (!string.IsNullOrEmpty(jwk.Alg) && jwk.Alg != algorithm)) throw new FormatException();
                    key = jwk; keyId = string.IsNullOrEmpty(options.KeyId) ? jwk.Kid : options.KeyId;
                }
                else
                {
                    if (algorithm.StartsWith("ES", StringComparison.Ordinal))
                    {
                        var ec = ECDsa.Create(); privateKey = ec; ec.ImportFromPem(source); key = new ECDsaSecurityKey(ec);
                    }
                    else
                    {
                        var rsa = RSA.Create(); privateKey = rsa; rsa.ImportFromPem(source); key = new RsaSecurityKey(rsa);
                    }
                    keyId = options.KeyId;
                }
                if (string.IsNullOrEmpty(keyId) || !key.CryptoProviderFactory.IsSupportedAlgorithm(algorithm, key)) throw new FormatException();
            }
            catch
            {
                privateKey?.Dispose(); privateKey = null; key = null;
                throw new IntegrationException("Kunne ikke laste privat JWK/PEM. Kontroller filsti, algoritme og nøkkel-ID (kid).", 503, "invalid_key");
            }
        }
        var exported = key switch {
            JsonWebKey jwk => jwk,
            RsaSecurityKey rsa => JsonWebKeyConverter.ConvertFromRSASecurityKey(rsa),
            ECDsaSecurityKey ec => JsonWebKeyConverter.ConvertFromECDsaSecurityKey(ec),
            _ => throw new IntegrationException("Ugyldig nøkkel.")
        };
        publicKey = exported.Kty == "RSA"
            ? new() { ["kty"] = "RSA", ["e"] = exported.E, ["n"] = exported.N }
            : new() { ["kty"] = "EC", ["crv"] = exported.Crv, ["x"] = exported.X, ["y"] = exported.Y };
    }

    private string Sign(Dictionary<string, object> headerValues, Dictionary<string, object> claims)
    {
        lock (signingGate)
        {
            var header = new JwtHeader(new SigningCredentials(key!, algorithm));
            header.Remove("kid");
            foreach (var pair in headerValues) header[pair.Key] = pair.Value;
            var payload = new JwtPayload();
            foreach (var pair in claims) payload[pair.Key] = pair.Value;
            return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(header, payload));
        }
    }

    private string Thumbprint() => Base64UrlEncoder.Encode(key!.ComputeJwkThumbprint());

    private string Proof(string url, string? nonce = null, string? accessToken = null)
    {
        var target = new UriBuilder(url) { Query = "", Fragment = "" }.Uri.AbsoluteUri;
        var claims = new Dictionary<string, object> { ["htm"] = "POST", ["htu"] = target,
            ["iat"] = clock.GetUtcNow().ToUnixTimeSeconds(), ["jti"] = Guid.NewGuid().ToString() };
        if (nonce is not null) claims["nonce"] = nonce;
        if (accessToken is not null) claims["ath"] = Base64UrlEncoder.Encode(SHA256.HashData(Encoding.UTF8.GetBytes(accessToken)));
        return Sign(new() { ["typ"] = "dpop+jwt", ["jwk"] = publicKey }, claims);
    }

    private string Assertion()
    {
        var now = clock.GetUtcNow().ToUnixTimeSeconds();
        var claims = new Dictionary<string, object> { ["iss"] = options.ClientId, ["sub"] = options.ClientId,
            ["aud"] = Targets.Issuer, ["iat"] = now, ["nbf"] = now, ["exp"] = now + 60, ["jti"] = Guid.NewGuid().ToString() };
        if ((options.MultiTenant && !IsOrganization(options.Parent)) || (options.Child.Length > 0 && !IsOrganization(options.Child)))
            throw new IntegrationException("Oppgi gyldig organisasjonsnummer for hovedenhet og eventuell underenhet.", 503, "invalid_configuration");
        if (options.MultiTenant || options.Child.Length > 0)
            claims["authorization_details"] = new object[] { new Dictionary<string, object> {
                ["type"] = "helseid_authorization", ["practitioner_role"] = new Dictionary<string, object> {
                    ["organization"] = new Dictionary<string, object> { ["identifier"] = new Dictionary<string, object> {
                        ["system"] = options.MultiTenant ? "urn:oid:1.0.6523" : "urn:oid:2.16.578.1.12.4.1.4.101", ["type"] = "ENH",
                        ["value"] = options.MultiTenant ? $"NO:ORGNR:{options.Parent}{(options.Child.Length > 0 ? ":" + options.Child : "")}" : options.Child
                    } }
                }
            } };
        return Sign(new() { ["typ"] = "client-authentication+jwt", ["kid"] = keyId! }, claims);
    }

    public async Task<AccessToken> GetToken()
    {
        await tokenGate.WaitAsync();
        try
        {
            if (Active) return token!;
            if (options.Missing().Length > 0)
                throw new IntegrationException(options.Mode == "test-token"
                    ? "Fyll inn API-nøkkel, API-mottaker, tilgang og testvirksomhet i tilkoblingsoppsettet."
                    : "HelseID test er ikke konfigurert. Fyll ut .env og legg privatnøkkelen i secrets/.", 503, "not_configured");
            LoadKey();
            token = options.Mode == "test-token" ? await ObtainTestToken() : await ObtainRegisteredToken();
            return token;
        }
        catch (IntegrationException) { throw; }
        catch
        {
            // Authentication failed before any Task was sent; do not mark delivery unknown.
            throw new IntegrationException("Kunne ikke hente token fra HelseID test. Kontroller nettverk og klientoppsett.", 502, "authentication_failed");
        }
        finally { tokenGate.Release(); }
    }

    private static bool IsOrganization(string? value) => Regex.IsMatch(value ?? "", "^[0-9]{9}$");
    private static JsonNode Claims(string? value)
    {
        if (value is null || value.Split('.').Length != 3) throw new FormatException();
        return JsonNode.Parse(Base64UrlEncoder.Decode(value.Split('.')[1])) ?? throw new FormatException();
    }

    private static async Task<JsonNode> ReadJson(HttpResponseMessage response)
    {
        var bytes = await response.Content.ReadAsByteArrayAsync();
        if (bytes.Length > 100_000) throw new IntegrationException("Svaret fra tjenesten er for stort.");
        return JsonNode.Parse(bytes) ?? throw new FormatException();
    }

    private async Task<AccessToken> ObtainTestToken()
    {
        if (!IsOrganization(options.Parent) || (options.Child.Length > 0 && !IsOrganization(options.Child)))
            throw new IntegrationException("Oppgi organisasjonsnummer med ni siffer for testvirksomheten.", 503, "invalid_configuration");
        if (!Guid.TryParseExact(testClientId, "D", out var clientGuid) || clientGuid == Guid.Empty)
            throw new IntegrationException("HELSEID_TTT_CLIENT_ID må være en gyldig UUID. La verdien være tom for å bruke appens automatiske test-ID.", 503, "invalid_configuration");
        var scope = options.Scope.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        var tokenId = Guid.NewGuid().ToString();
        var clientClaims = new JsonObject {
            ["scope"] = new JsonArray(scope.Select(s => JsonValue.Create(s)).ToArray()), ["orgnrParent"] = options.Parent,
            ["cnfJkt"] = Thumbprint(), ["clientId"] = testClientId, ["clientName"] = ClientName, ["jti"] = tokenId,
            ["clientTenancy"] = true, ["clientTenancyType"] = 1, ["clientAuthenticationMethodsReferences"] = "private_key_jwt"
        };
        if (options.Child.Length > 0) clientClaims["orgnrChild"] = options.Child;
        var payload = new JsonObject {
            ["audience"] = options.Audience, ["withoutDefaultClientClaims"] = true, ["withoutDefaultUserClaims"] = true,
            ["createDPoPTokenWithDPoPProof"] = false, ["expirationParameters"] = new JsonObject { ["expirationTimeInSeconds"] = 300 },
            ["clientClaimsParameters"] = clientClaims
        };
        using var request = new HttpRequestMessage(HttpMethod.Post, Targets.TestToken) { Content = new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json") };
        request.Headers.Add("X-Auth-Key", options.ApiKey);
        request.Headers.Accept.Add(new("application/json"));
        HttpResponseMessage response;
        try { response = await http.SendAsync(request); }
        catch { throw new IntegrationException("Kunne ikke kontakte HelseID test-token-tjenesten. Kontroller nettverk og prøv igjen.", 502, "ttt_unavailable"); }
        using (response)
        {
            var status = (int)response.StatusCode;
            if (!response.IsSuccessStatusCode)
                throw new IntegrationException(status switch {
                    401 => "Test-token-tjenesten avviste API-nøkkelen (HTTP 401). Lim inn en gyldig nøkkel fra HelseID Selvbetjening test og lagre oppsettet.",
                    400 => "Test-token-tjenesten avviste tokenforespørselen (HTTP 400). Kontroller API-mottaker, tilgang og organisasjonsnummer.",
                    _ => $"Test-token-tjenesten svarte HTTP {status}. Prøv igjen, eller kontroller tilgangen i HelseID Selvbetjening test."
                }, 502, "ttt_rejected");
            JsonNode result;
            try { result = await ReadJson(response); }
            catch { throw new IntegrationException("Test-token-tjenesten returnerte et ugyldig svar.", 502, "invalid_test_token"); }
            if (result.At("isError").IsTrue()) throw new IntegrationException("Test-token-tjenesten avviste tokenforespørselen. Kontroller audience, scope og testvirksomhet.", 502, "ttt_rejected");
            var value = result.Text("successResponse", "accessTokenJwt");
            try
            {
                var claims = Claims(value);
                var now = clock.GetUtcNow().ToUnixTimeSeconds();
                var exp = claims.At("exp").Number(); var iat = claims.At("iat").Number(); var nbf = claims.At("nbf").Number();
                var audiences = claims.At("aud") is JsonArray a ? a.Select(x => x.Text()) : [claims.Text("aud")];
                var scopes = claims.At("scope") is JsonArray s ? s.Select(x => x.Text()) : (claims.Text("scope") ?? "").Split(' ');
                if (claims.Text("iss") != Targets.Issuer || !audiences.Contains(options.Audience)
                    || claims.Text("client_id") != testClientId || claims.Text("helseid://claims/client/client_name") != ClientName
                    || claims.Text("helseid://claims/client/client_tenancy") != "single-tenant" || claims.Text("client_amr") != "private_key_jwt"
                    || claims.Text("jti") != tokenId || exp is null || exp <= now + 30 || iat is null || iat > now + 30 || iat >= exp
                    || nbf is null || nbf > now + 30 || nbf >= exp || claims.Text("cnf", "jkt") != Thumbprint()
                    || claims.Text(OrgClaim) != options.Parent || (options.Child.Length > 0 && claims.Text(ChildClaim) != options.Child)
                    || !scope.All(scopes.Contains)) throw new FormatException();
                return new(value!, DateTimeOffset.FromUnixTimeSeconds((long)Math.Min(exp.Value, now + 300)), options.Parent);
            }
            catch { throw new IntegrationException("Test-tokenet mangler påkrevde klientopplysninger eller har feil gyldighet, innhold eller DPoP-binding.", 502, "invalid_test_token"); }
        }
    }

    private async Task<AccessToken> ObtainRegisteredToken()
    {
        if (tokenEndpoint is null)
        {
            using var response = await http.GetAsync(Targets.Issuer + "/.well-known/openid-configuration");
            if (!response.IsSuccessStatusCode) throw new IntegrationException($"HelseID discovery svarte HTTP {(int)response.StatusCode}.");
            var doc = await ReadJson(response);
            if (doc.Text("issuer") != Targets.Issuer || !Uri.TryCreate(doc.Text("token_endpoint"), UriKind.Absolute, out var endpoint)
                || endpoint.GetLeftPart(UriPartial.Authority) != Targets.Issuer || endpoint.UserInfo.Length > 0 || endpoint.Query.Length > 0 || endpoint.Fragment.Length > 0)
                throw new IntegrationException("HelseID discovery returnerte et uventet endepunkt.");
            tokenEndpoint = endpoint.AbsoluteUri;
        }
        for (var attempt = 0; attempt < 2; attempt++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, tokenEndpoint) { Content = new FormUrlEncodedContent(new Dictionary<string, string> {
                ["grant_type"] = "client_credentials", ["client_id"] = options.ClientId, ["scope"] = options.Scope,
                ["client_assertion_type"] = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", ["client_assertion"] = Assertion()
            }) };
            request.Headers.Add("DPoP", Proof(tokenEndpoint, tokenNonce));
            using var response = await http.SendAsync(request);
            JsonNode result;
            try { result = await ReadJson(response); }
            catch { throw new IntegrationException($"HelseID svarte HTTP {(int)response.StatusCode} uten gyldig JSON."); }
            var nonce = Header(response, "DPoP-Nonce"); if (nonce is not null) tokenNonce = nonce;
            if ((int)response.StatusCode == 400 && result.Text("error") == "use_dpop_nonce" && nonce is not null && attempt == 0) continue;
            if (!response.IsSuccessStatusCode)
            {
                var code = result.Text("error") ?? "";
                if (!Regex.IsMatch(code, "^[a-z_]{1,60}$")) code = "token_error";
                throw new IntegrationException($"HelseID avviste autentiseringen (HTTP {(int)response.StatusCode}, {code}). Kontroller klientens nøkkel, scope og godkjenning.", 502, code);
            }
            var value = result.Text("access_token"); var seconds = result.At("expires_in").Number();
            if (!string.Equals(result.Text("token_type"), "dpop", StringComparison.OrdinalIgnoreCase) || value is null || seconds is null || seconds <= 30)
                throw new IntegrationException("HelseID returnerte ikke et gyldig DPoP-token.");
            var claims = Claims(value);
            if (claims.Text("cnf", "jkt") != Thumbprint()) throw new IntegrationException("HelseID-tokenet er ikke bundet til klientens DPoP-nøkkel.");
            var organization = claims.Text(OrgClaim);
            if (!IsOrganization(organization)) throw new IntegrationException("Tokenet mangler orgnr_parent som Helsenorge krever. Kontroller organisasjon/delegering i HelseID.", 502, "missing_organization");
            var exp = Math.Min(clock.GetUtcNow().ToUnixTimeSeconds() + seconds.Value, claims.At("exp").Number() ?? double.MaxValue);
            return new(value, DateTimeOffset.FromUnixTimeSeconds((long)exp), organization!);
        }
        throw new IntegrationException("HelseID kunne ikke fullføre DPoP-utfordringen.");
    }

    private static string? Header(HttpResponseMessage response, string name) => response.Headers.TryGetValues(name, out var values) ? values.FirstOrDefault() : null;

    public async Task<SubmissionResult> SendTask(JsonNode task, string correlationId, string environmentId)
    {
        var environment = Targets.Find(environmentId);
        var accessToken = await GetToken();
        for (var attempt = 0; attempt < 2; attempt++)
        {
            apiNonces.TryGetValue(environmentId, out var nonce);
            using var request = new HttpRequestMessage(HttpMethod.Post, environment.Endpoint) { Content = new StringContent(task.ToJsonString(), Encoding.UTF8, "application/fhir+json") };
            request.Headers.Accept.Add(new("application/fhir+json"));
            request.Headers.Authorization = new AuthenticationHeaderValue("DPoP", accessToken.Value);
            request.Headers.Add("DPoP", Proof(environment.Endpoint, nonce, accessToken.Value));
            request.Headers.Add("X-Correlation-ID", correlationId);
            HttpResponseMessage response;
            try { response = await http.SendAsync(request); }
            catch { throw new IntegrationException($"Forbindelsen ble avbrutt under innsending. Leveringsstatus er ukjent. Kontroller oppgaven i {environment.Label} før et nytt forsøk.", 502, "delivery_unknown"); }
            using (response)
            {
                var status = (int)response.StatusCode;
                var nextNonce = Header(response, "DPoP-Nonce");
                if (nextNonce is not null) apiNonces[environmentId] = nextNonce;
                if (status == 401 && nextNonce is not null && (Header(response, "WWW-Authenticate") ?? "").Contains("use_dpop_nonce") && attempt == 0) continue;
                string raw;
                try { raw = await response.Content.ReadAsStringAsync(); }
                catch { throw new IntegrationException($"Innsendingen fikk et ufullstendig svar. Leveringsstatus er ukjent; kontroller {environment.Label} før et nytt forsøk.", 502, "delivery_unknown"); }
                JsonNode? body; try { body = JsonNode.Parse(raw); } catch { body = JsonValue.Create(raw); }
                if (status is 401 or 403) token = null;
                return new(response.IsSuccessStatusCode, status, body, environmentId, Header(response, "Location"), correlationId, status >= 500 || status == 408, clock.GetUtcNow());
            }
        }
        throw new IntegrationException("Helsenorge avviste DPoP-beviset.");
    }

    public void Dispose() { privateKey?.Dispose(); tokenGate.Dispose(); }
}
