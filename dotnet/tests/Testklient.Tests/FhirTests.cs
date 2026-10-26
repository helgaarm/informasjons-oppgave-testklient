using System.Text.Json.Nodes;
using Testklient;

namespace Testklient.Tests;

[TestClass]
public sealed class FhirTests
{
    private readonly FhirService fhir = new(TimeProvider.System);

    [TestMethod]
    public void ValidTaskPassesAndExtensionsSurviveImport()
    {
        var task = TestData.Task();
        task["extension"] = new JsonArray(new JsonObject { ["url"] = "https://example.org/synthetic-extension", ["valueString"] = "kept" });
        Assert.IsFalse(fhir.Validate(task).Any(i => i.Severity == "error"));
        Assert.IsTrue(JsonNode.DeepEquals(task, fhir.Import(task.ToJsonString())));
    }

    [TestMethod]
    public void SchemaContainsChoicesAndBackboneFields()
    {
        var schema = fhir.Schema();
        Assert.IsTrue(schema["Task"].Any(f => f.Name == "restriction"));
        Assert.IsTrue(schema["Extension"].Any(f => f.Name == "valueDate" && f.Choice == "value"));
        var restriction = schema["Task"].Single(f => f.Name == "restriction").Type;
        Assert.IsTrue(schema[restriction].Any(f => f.Name == "period"));
        Assert.IsTrue(schema["Task"].Single(f => f.Name == "identifier").Multiple);
    }

    [TestMethod]
    public void DraftImportAllowsMissingBusinessFields()
    {
        var draft = fhir.Import("{\"resourceType\":\"Task\",\"status\":\"ready\",\"intent\":\"proposal\"}");
        Assert.AreEqual("Task", draft.Text("resourceType"));
        Assert.IsTrue(fhir.Validate(draft).Any(i => i.Severity == "error"));
    }

    [TestMethod]
    public void EmptyFormFieldsCanBeImportedForContinuedEditing()
    {
        var task = TestData.Task();
        task["code"]!["text"] = ""; task["description"] = ""; task["instantiatesUri"] = "";
        task["owner"]!["identifier"]!["value"] = "";
        task["contained"]![0]!["name"] = ""; task["restriction"]!["period"]!["end"] = "";
        Assert.IsTrue(JsonNode.DeepEquals(task, fhir.Import(task.ToJsonString())));
    }

    [TestMethod]
    public void FirelyRejectsWrongTypesAndUnknownFieldsOnValidation()
    {
        var task = TestData.Task(); task["priority"] = new JsonObject { ["wrong"] = true };
        Assert.IsTrue(fhir.Validate(task).Any(i => i.Source == "Firely FHIR R4" && i.Severity == "error"));
        task = TestData.Task(); task["notAFhirField"] = "wrong";
        Assert.IsTrue(fhir.Validate(task).Any(i => i.Source == "Firely FHIR R4" && i.Severity == "error"));
    }

    [TestMethod]
    [DataRow("{\"resourceType\":\"Bundle\"}")]
    [DataRow("{\"resourceType\":\"Task\",\"__proto__\":{\"polluted\":true}}")]
    [DataRow("{\"resourceType\":\"Task\",\"identifier\":{\"value\":\"invalid-shape\"}}")]
    [DataRow("<!DOCTYPE Task [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><Task xmlns='http://hl7.org/fhir'><description value='&x;'/></Task>")]
    public void UnsafeOrUnsupportedImportIsRejected(string text) => Assert.Throws<IntegrationException>(() => fhir.Import(text));

    [TestMethod]
    public void XmlIsConvertedWithFirely()
    {
        var imported = fhir.Import("<Task xmlns='http://hl7.org/fhir'><status value='ready'/><intent value='proposal'/></Task>");
        Assert.AreEqual("Task", imported.Text("resourceType")); Assert.AreEqual("ready", imported.Text("status"));
    }

    [TestMethod]
    public void InvalidCalendarAndMissingOrganizationAreReported()
    {
        var task = TestData.Task(); task["restriction"]!["period"]!["end"] = "2099-02-31"; task["contained"] = new JsonArray();
        var issues = fhir.Validate(task);
        Assert.IsTrue(issues.Any(i => i.Path == "restriction.period.end"));
        Assert.IsTrue(issues.Any(i => i.Path == "requester"));
    }
}
