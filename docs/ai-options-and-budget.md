# AI / LM options while staying inside Azure credits

## Safe options

### 1) Local/open models on the VM
This consumes VM compute, storage, and bandwidth only.

### 2) Azure OpenAI (pay-as-you-go)
Use this for selective calls where you want frontier-grade quality.

### 3) Azure AI Foundry Models (serverless, pay-as-you-go)
Use this for Azure-hosted model catalog experiments.

## What to avoid early
- provisioned throughput
- fine-tuned model hosting
- GPU VMs
- always-on large VMs
- high-volume token fan-out
