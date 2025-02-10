// Webview panel setup/communication

import { Organization } from '../api/__generated__/graphql';

/**
 * Takes in a set of policy statements and turns them into html to display
 */
export function getHTMLForStatments(organization: Organization) {

  const policy = organization.policy;
  const statements = organization.policy.statements;

  // Create simple list of plicy statements

  const statementsList = statements.map((statement: any) => {
    const capability = statement.payload?.capability;
    // const capabilityInfo = capability
    //   ? `<br>Capability ID: ${capability.id} | Title: ${capability.title}`
    //   : '';

    return `
      <li>
        <p>All resources must enable</p> 
        <strong>Framework:</strong> ${statement.framework}<br>
        <Strong>Title:</strong> ${capability.title} <br>
      </li>
    `;
  }).join(''); 

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: sans-serif; padding: 1rem; }
          li { margin-bottom: 1rem; }
        </style>
      </head>
      <body>
        <h1>Organization Data</h1>
        <p><strong>ID:</strong> ${organization.id}</p>
        <p><strong>Name:</strong> ${organization.name}</p>

        <h2>Policy Statements</h2>
        <ul>
          ${statementsList}
        </ul>
      </body>
    </html>
  `;
}

