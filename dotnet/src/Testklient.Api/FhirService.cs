using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml;
using Hl7.Fhir.Introspection;
using Hl7.Fhir.Model;
using Hl7.Fhir.Serialization;
using Hl7.Fhir.Utility;
using FhirTask = Hl7.Fhir.Model.Task;

namespace Testklient;

public sealed record FieldDefinition(string Name, string Type, bool Multiple, bool Required, string? Choice = null);

public sealed class FhirService(TimeProvider clock)
{
    private static readonly Lazy<IReadOnlyDictionary<string, FieldDefinition[]>> Fields = new(BuildSchema);
    public IReadOnlyDictionary<string, FieldDefinition[]> Schema() => Fields.Value;

    public JsonNode Import(string? text)
    {
        if (text is null || Encoding.UTF8.GetByteCount(text) > 1024 * 1024)
            throw new IntegrationException("Velg en JSON- eller XML-fil på maksimalt 1 MB.", 400);
        try
        {
            JsonNode node;
            if (text.TrimStart().StartsWith('<'))
            {
                // No DTDs, external entities, network resolution or unbounded expansion.
                var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null,
                    MaxCharactersInDocument = 1024 * 1024, MaxCharactersFromEntities = 0 };
                using (var preflightSource = new StringReader(text))
                using (var preflight = XmlReader.Create(preflightSource, settings))
                {
                    var count = 0;
                    while (preflight.Read())
                        if (++count > 20_000 || preflight.Depth > 40) throw new FormatException();
                }
                using var source = new StringReader(text);
                using var reader = XmlReader.Create(source, settings);
                var resource = FhirXmlDeserializer.DEFAULT.DeserializeResource(reader);
                if (resource is not FhirTask) throw new FormatException("Filen må inneholde én FHIR Task. Bundle støttes ikke i denne klienten.");
                node = JsonNode.Parse(new FhirJsonSerializer().SerializeToString(resource))!;
            }
            else
            {
                node = JsonNode.Parse(text, documentOptions: new JsonDocumentOptions { MaxDepth = 48 }) ?? throw new FormatException();
                TaskRules.AssertSafe(node);
                if (node.Text("resourceType") != "Task") throw new FormatException("Filen må inneholde én FHIR Task. Bundle støttes ikke i denne klienten.");
                CheckStructure(node);
                // Drafts may be incomplete. Keep the original JSON (including extensions)
                // and leave required-field/profile checks to the explicit validation step.
                var parser = new FhirJsonDeserializer(new DeserializerSettings { Validator = null, AcceptUnknownMembers = true });
                parser.DeserializeResource(text);
            }
            TaskRules.AssertSafe(node);
            return node;
        }
        catch (IntegrationException) { throw; }
        catch (Exception e) when (e is JsonException or FormatException or XmlException or DeserializationFailedException or InvalidOperationException or ArgumentException)
        {
            throw new IntegrationException("Filen må inneholde én FHIR Task med gyldig JSON- eller XML-struktur. Kontroller feltnavn, datatyper og lister. XML med DTD eller egendefinerte entiteter støttes ikke.", 400, "invalid_fhir");
        }
    }

    public List<ValidationIssue> Validate(JsonNode? task)
    {
        var issues = TaskRules.Validate(task, clock);
        if (issues.Any(i => i.Path is "Task" or "resourceType")) return issues;
        try { CheckStructure(task!); FhirJsonDeserializer.DEFAULT.Deserialize<FhirTask>(task!.ToJsonString()); }
        catch (DeserializationFailedException e)
        {
            foreach (var error in e.Exceptions.Take(100))
            {
                var detail = error as ExtendedCodedException;
                var path = detail?.InstancePath ?? "Task";
                // Report location and stable error codes, never raw parser input values.
                issues.Add(new(path, $"Ugyldig FHIR R4-felt. Kontroller datatype, format og obligatoriske felt ({error.ErrorCode}).",
                    detail?.IssueSeverity == OperationOutcome.IssueSeverity.Warning ? "warning" : "error", "Firely FHIR R4"));
            }
        }
        catch (Exception e) when (e is FormatException or JsonException or InvalidOperationException)
        {
            issues.Add(new("Task", "FHIR-strukturen kunne ikke valideres. Kontroller datatyper og lister.", "error", "Firely FHIR R4"));
        }
        return issues;
    }

    // Firely can recover a single object supplied for a repeating element.
    // The tree editor requires actual arrays, so enforce its shape before import.
    private void CheckStructure(JsonNode node)
    {
        var schema = Schema();
        void Visit(JsonNode? value, FieldDefinition definition)
        {
            if (definition.Multiple)
            {
                if (value is not JsonArray array) throw new FormatException();
                foreach (var item in array) Visit(item, definition with { Multiple = false });
                return;
            }
            var type = definition.Type == "Resource" ? value.Text("resourceType") ?? "Resource" : definition.Type;
            schema.TryGetValue(type, out var properties);
            if (definition.Type == "Resource" || properties is { Length: > 0 })
            {
                if (value is not JsonObject obj) throw new FormatException();
                foreach (var pair in obj)
                    if (properties?.FirstOrDefault(p => p.Name == pair.Key) is { } child) Visit(pair.Value, child);
            }
            else if (value is not null)
            {
                var valid = type == "boolean" ? value is JsonValue boolean && boolean.TryGetValue<bool>(out _)
                    : type is "decimal" or "integer" or "positiveInt" or "unsignedInt" ? value.Number() is not null
                    : value.Text() is not null;
                if (!valid) throw new FormatException();
            }
        }
        Visit(node, new("Task", "Task", false, true));
    }

    private static IReadOnlyDictionary<string, FieldDefinition[]> BuildSchema()
    {
        var inspector = ModelInfo.ModelInspector;
        var result = new Dictionary<string, FieldDefinition[]>();
        var queue = new Queue<ClassMapping>();
        foreach (var name in new[] { "Task", "Organization", "Patient", "Practitioner", "Communication" })
            queue.Enqueue(inspector.FindClassMapping(name)!);
        string Name(ClassMapping mapping) => mapping.IsCodeOfT ? "code" : mapping.Name;
        while (queue.TryDequeue(out var mapping))
        {
            var name = Name(mapping);
            if (result.ContainsKey(name)) continue;
            result[name] = [];
            if (mapping.IsPrimitive || mapping.IsFhirPrimitive) continue;
            var fields = new List<FieldDefinition>();
            foreach (var property in mapping.PropertyMappings.OrderBy(p => p.Order))
            {
                var types = property.FhirTypeMappings.ToArray();
                foreach (var type in types)
                {
                    var typeName = Name(type);
                    var choice = property.Choice == ChoiceType.DatatypeChoice;
                    var fieldName = choice ? property.Name + char.ToUpperInvariant(typeName[0]) + typeName[1..] : property.Name;
                    fields.Add(new(fieldName, typeName, property.IsCollection, property.IsMandatoryElement, choice ? property.Name : null));
                    if (!result.ContainsKey(typeName)) queue.Enqueue(type);
                    if (!choice) break;
                }
            }
            result[name] = fields.ToArray();
        }
        return result;
    }
}
