using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Testklient;

public sealed record ValidationIssue(string Path, string Message, string Severity = "error", string? Source = null);

public static class TaskRules
{
    public const string UuidSystem = "urn:ietf:rfc:3986";
    public const string PersonSystem = "urn:oid:2.16.578.1.12.4.1.4.1";
    public const string AreaSystem = "urn:oid:2.16.578.1.12.4.1.1.7618";
    public const string DeadlineSystem = "http://helsenorge.no/fhir/StructureDefinition/hn-task-deadline";
    private static bool Uuid(string? value) => Regex.IsMatch(value ?? "", "^(?:urn:uuid:)?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$", RegexOptions.IgnoreCase);

    public static void AssertSafe(JsonNode? node)
    {
        var count = 0;
        void Walk(JsonNode? item, int depth)
        {
            if (++count > 20_000 || depth > 40) throw new FormatException("FHIR-ressursen er for stor eller har for mange nivåer.");
            if (item is JsonObject obj)
                foreach (var (key, value) in obj)
                {
                    if (key is "__proto__" or "constructor" or "prototype") throw new FormatException("FHIR-ressursen inneholder et ugyldig feltnavn.");
                    Walk(value, depth + 1);
                }
            else if (item is JsonArray array) foreach (var value in array) Walk(value, depth + 1);
        }
        Walk(node, 0);
    }

    private static bool CalendarDate(string? value)
    {
        if (value is null || !Regex.IsMatch(value, "^[0-9]{4}-[0-9]{2}-[0-9]{2}(?:T.*)?$")
            || !DateOnly.TryParseExact(value[..10], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) return false;
        return value.Length == 10 || DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    }

    public static List<ValidationIssue> Validate(JsonNode? task, TimeProvider clock)
    {
        var issues = new List<ValidationIssue>();
        void Add(string path, string message, string severity = "error") => issues.Add(new(path, message, severity));
        if (task.Text("resourceType") != "Task") { Add("resourceType", "Ressursen må være en FHIR Task."); return issues; }
        try { AssertSafe(task); } catch (FormatException e) { Add("Task", e.Message); return issues; }
        if (task.Text("status") != "ready") Add("status", "En ny oppgave må ha status ready.");
        if (task.Text("intent") is not ("proposal" or "plan")) Add("intent", "Velg proposal eller plan.");
        if (task.Text("intent") == "plan") Add("intent", "Plan skal bare brukes når oppgaven er direkte knyttet til helsehjelp.", "warning");
        if (task.Text("focus", "type") != "Communication") Add("focus.type", "Informasjonsoppgaver må ha focus.type = Communication.");
        if (!task.At("identifier").Items().Any(i => i.Text("system") == UuidSystem && Uuid(i.Text("value")))) Add("identifier", "Oppgi en UUID som forretningsidentifikator med system urn:ietf:rfc:3986.");
        if (task.At("id") is not null)
        {
            if (!Uuid(task.Text("id"))) Add("id", "Helsenorge krever GUID som ressurs-ID.");
            Add("id", "Ved POST bestemmer Helsenorge ressurs-ID. Bruk identifier til oppfølging.", "warning");
        }
        foreach (var (path, max, required) in new[] { ("code.text", 250, true), ("description", 2000, true), ("reasonCode.text", 250, false), ("statusReason.text", 250, false) })
        {
            var node = task.At(path.Split('.').Cast<object>().ToArray());
            var value = node.Text();
            if (required && string.IsNullOrWhiteSpace(value)) Add(path, "Feltet må fylles ut.");
            if (node is not null && value is null) Add(path, "Verdien må være tekst.");
            if (value?.Length > max) Add(path, $"Maksimalt {max} tegn.");
        }
        if (!Uri.TryCreate(task.Text("instantiatesUri"), UriKind.Absolute, out var url) || url.Scheme is not ("http" or "https") || url.UserInfo.Length > 0)
            Add("instantiatesUri", "Oppgi en fullstendig http(s)-adresse til informasjonen.");
        if (task.Text("instantiatesUri")?.StartsWith("http:") == true) Add("instantiatesUri", "Bruk HTTPS for informasjonssiden.", "warning");
        if (task.Text("owner", "type") != "Patient" || task.Text("owner", "identifier", "system") != PersonSystem
            || !Regex.IsMatch(task.Text("owner", "identifier", "value") ?? "", "^[0-9]{11}$"))
            Add("owner.identifier.value", "Oppgi testpersonens 11-sifrede fødselsnummer/D-nummer i owner (Patient).");
        var areas = task.At("meta", "security").Items().Where(c => c.Text("system") == AreaSystem).ToArray();
        if (areas.Length != 1 || areas[0].Text("code") is not ("1" or "2" or "3" or "4" or "5" or "6")) Add("meta.security", "Velg ett gyldig tjenesteområde (kodeverk 7618).");
        var reference = task.Text("requester", "reference");
        var org = reference?.StartsWith('#') == true ? task.At("contained").Items().FirstOrDefault(r => r.Text("id") == reference[1..]) : null;
        if (org.Text("resourceType") != "Organization" || task.Text("requester", "type") != "Organization") Add("requester", "Avsender må referere til en Organization i contained.");
        if (org is not null && (string.IsNullOrWhiteSpace(org.Text("name")) || org.Text("name")?.Length > 250)) Add("contained.name", "Oppgi avsenders navn (maksimalt 250 tegn).");
        foreach (var contact in org.At("contact").Items())
            if (contact.Text("purpose", "text")?.Length > 1024) Add("contained.contact.purpose.text", "Kontaktbeskrivelse kan ha maksimalt 1024 tegn.");
        var end = task.Text("restriction", "period", "end");
        if (!CalendarDate(end)) Add("restriction.period.end", "Oppgi en gyldig svarfrist.");
        else if (string.CompareOrdinal(end![..10], clock.GetUtcNow().ToString("yyyy-MM-dd")) < 0) Add("restriction.period.end", "Svarfristen har passert.", "warning");
        if (task.At("restriction", "period", "start") is not null) Add("restriction.period.start", "Helsenorge dokumenterer ikke støtte for tidligste startdato.", "warning");
        foreach (var extension in task.At("restriction", "extension").Items().Where(x => x.Text("url") == DeadlineSystem))
        {
            var deadline = extension.Text("valueDate");
            if (deadline?.Length != 10 || !CalendarDate(deadline)) Add("restriction.extension", "Absolutt frist må være en gyldig dato.");
            else if (end is { Length: >= 10 } && string.CompareOrdinal(deadline, end[..10]) < 0) Add("restriction.extension", "Absolutt frist kan ikke være før svarfristen.");
        }
        if (task.At("note").Items().Any()) Add("note", "Notater støttes bare ved senere oppdatering, ikke ved opprettelse.");
        if (task.At("priority") is not null) Add("priority", "Prioritet benyttes ikke av Helsenorge.", "warning");
        return issues;
    }
}
