// Webview panel setup/communication

import { SecurityBenchmarkQueryBenchmarkArray } from '../api/client';

/**
 * Takes in a set of policy statements and turns them into html to display
 */
export function getHTMLForBenchmarks(
  benchmarks: SecurityBenchmarkQueryBenchmarkArray,
) {
  // Create simple list of policy statements
  const statementsList = benchmarks
    .reduce((acc:string[],benchmark) => {
      const versions = benchmark.versions.reduce((acc:string[], version) => {
        const recommendations = version.recommendations.reduce((acc:string[], recommendation) => {
          if (!recommendation.isAdopted){return acc;};
          return [...acc,`
          <li>
            <p>Recommendation: ${recommendation.name}</p>
            </li>
        `];
        },[] as string[]);
        if (recommendations.length ===0){return acc;};
        return [...acc,`
        <li>
            <p>Version: ${version.name}</p>
            <ul>
            ${recommendations.join('')}
            </ul>
            </li>
        `];
      },[] as string[]);
      if (versions.length === 0){return acc;};
      return [...acc,`
          <li>
            <p>Benchmark: ${benchmark.name}</p> 
            <ul>
              ${versions.join('')}
            </ul>
          `];
    },[] as string[])
    .join('');

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
        <h1>Security Benchmarks</h2>
        <ul>
          ${statementsList}
        </ul>
      </body>
    </html>
  `;
}
