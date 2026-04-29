resource sqlServer 'Microsoft.Sql/servers@2021-11-01' = {
  name: 'test-sql-server'
  location: 'eastus'
  properties: {
    administratorLogin: 'sqladmin'
    administratorLoginPassword: 'placeholder'
  }
}

resource securityAlertPolicy 'Microsoft.Sql/servers/securityAlertPolicies@2021-11-01' = {
  name: '${sqlServer.name}/Default'
  properties: {
    state: 'Enabled'
    disabledAlerts: ['Sql_Injection']
  }
}
