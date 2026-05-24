param name string
param location string

resource openai 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: name
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  tags: {
    project: 'blue-swallow-society'
  }
}

output endpoint string = openai.properties.endpoint
