## Gomboc AI \- Cloud Security for Code  
Whether writing new cloud infrastructure or cleaning up legacy code, Gomboc's VS Code Plugin enables real-time, AI-generated code fixes. Start your [free trial](https://app.gomboc.ai/) with Gomboc AI today\!

## Overview   
The Gomboc.ai VSCode Plugin transforms how developers handle cloud issues in source files. By integrating directly into your IDE, it eliminates security bottlenecks, automates compliance, and provides actionable fixes in real time, so you can deploy faster and safer.  

## Key Features

* Real-Time Security Guardrail   
  Catch misconfigurations and vulnerabilities as you code. Get instant feedback and one-click fixes for AWS, Azure, and GCP templates and config files.    
* Automated Compliance    
  Enforce security best practices and regulatory standards (CIS, NIST CSF, etc.) without manual reviews. Gomboc auto-remediates issues to keep deployments compliant.    
* Accelerate CI/CD Pipelines  
  Reduce security delays in code reviews. Ship features faster by resolving issues before they reach production.    
* GitOps Integration  
  Embed security into pull requests and Git workflows. Aligns with DevOps practices to ensure "secure-by-default" infrastructure.    
* Contextual Guidance    
  Understand why a security control matters and how to implement it—eliminates hours of research.

## Getting Started
To begin using the Gomboc VSCode plugin, you will need to acquire an API key. You can follow the [setup steps in our docs](https://docs.gomboc.ai/#id-1.-get-started-in-vs-code).

Once you have the API key go to `Settings > Extensions > Gomboc` and drop it in the `API Key` field.

That's all you need!

## Telemetry
Gomboc emits sanitized OpenTelemetry traces to help diagnose extension health and scan performance. Extension telemetry is enabled by default with `gomboc-vscode-extension.telemetryEnabled`, but network export always respects VS Code's global telemetry setting.

To opt out, set either:

```json
{
  "gomboc-vscode-extension.telemetryEnabled": false
}
```

or disable telemetry globally in VS Code:

```json
{
  "telemetry.telemetryLevel": "off"
}
```

By default, traces are sent to the Gomboc integrations telemetry endpoint derived from `gomboc-vscode-extension.integrationsServiceUrl`: `https://integrations.app.gomboc.ai/telemetry/v1/traces`. This default endpoint uses your configured `gomboc-vscode-extension.apiKey` for authentication.

To send telemetry to your own OpenTelemetry Collector instead, configure:

```json
{
  "gomboc-vscode-extension.telemetryOtlpTracesEndpoint": "http://localhost:4318/v1/traces",
  "gomboc-vscode-extension.telemetryHeaders": {
    "Authorization": "Bearer <token>"
  }
}
```

To export the same telemetry to multiple collectors, use the plural setting. When this list is not empty, it takes precedence over `gomboc-vscode-extension.telemetryOtlpTracesEndpoint`:

```json
{
  "gomboc-vscode-extension.telemetryOtlpTracesEndpoints": [
    "http://localhost:4318/v1/traces",
    "https://collector.example.com/v1/traces"
  ]
}
```

Gomboc authentication headers are added automatically only for the Gomboc integrations telemetry endpoint. Custom collectors receive only headers explicitly configured in `gomboc-vscode-extension.telemetryHeaders`.

Sanitized telemetry is also mirrored locally in the `Gomboc Telemetry` output channel when `gomboc-vscode-extension.telemetryOutputChannelEnabled` is true. Telemetry excludes API keys, collector headers, full local paths, file contents, raw ORL reports, remediation diffs, repository names, usernames, home directories, and tokens.

### Commands 
* `Test API Key` - Test your API key connection and make sure that it can hit our server
* `Show organization benchmarks` - Display the security policy that your organization has enabled
* `Scan current file or scenario` - Perform a scan

## Why Gomboc AI?    
"Security shouldn’t derail development. Our plugin gives engineers real-time fixes that meet security requirements, right in their workflow — no more chasing tickets or delayed releases."   
– Matt Sweeney, CPO & Co-Founder, Gomboc.ai    

## Resources    
* [Information](https://www.gomboc.ai/devops)    
* [Documentation](https://docs.gomboc.ai/)
* [Submit Feedback](mailto:support@gomboc.ai) 
