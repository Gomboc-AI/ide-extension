// Webview panel setup/communication

import { SecurityBenchmarkQueryBenchmarkArray } from '../api/client';

/**
 * Takes in a set of policy statements and turns them into html to display
 */
export function getHTMLForBenchmarks(
  benchmarks: SecurityBenchmarkQueryBenchmarkArray,
) {
  // Create simple list of plicy statements

  const statementsList = benchmarks
    .map(benchmark => {
      const versions = benchmark.versions.map(version => {
        const recommendations = version.recommendations.map(recommendation => {
          return `
          <li>
            <p>Recommendation: ${recommendation.name}</p>
            </li>
        `;
        });
        return `
        <li>
            <p>Version: ${version.name}</p>
            <ul>
            ${recommendations.join('')}
            </ul>
            </li>
        `;
      });
      return `
          <li>
            <p>Benchmark: ${benchmark.name}</p> 
            <ul>
              ${versions.join('')}
            </ul>
          `;
    })
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
