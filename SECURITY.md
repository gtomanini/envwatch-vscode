# Security Policy

## Supported versions

Only the latest released version of EnvWatch receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report it privately through GitHub: go to the repository's **Security** tab and click **Report a vulnerability** ([direct link](https://github.com/gtomanini/envwatch-vscode/security/advisories/new)).

Include a description of the issue, steps to reproduce and the potential impact. You should receive a response within 7 days. Once a fix is released, the advisory will be published with credit to the reporter unless you prefer to stay anonymous.

## Scope

EnvWatch reads files in your workspace locally and never sends data over the network. Issues of particular interest include anything that could cause the extension to display or transmit environment variable **values**, read files outside the workspace, or execute code.
