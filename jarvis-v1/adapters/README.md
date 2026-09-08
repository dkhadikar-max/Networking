# Open-source adapter layer

## OpenClaw

Use OpenClaw as the device/channel shell for phone, iPad, WebChat and voice where supported. JARVIS Core remains the business/control plane.

## Browser Use

Expose browser execution as a gated tool. Default permission: approval required for authenticated external actions.

## OpenHands

Expose coding tasks through a gated coding adapter. Default permission: code/test may execute; production deployment requires approval.

## Qwen3 / Qwen-Agent

Optional open-weight model provider. Keep the existing Claude provider as the default until Qwen3 is benchmarked against the BYN task suite.

## Adapter contract

Every adapter should implement:

```js
{
  name,
  capabilities: [],
  async health(),
  async execute({ task, context }),
}
```

Adapters must not receive unrestricted credentials. Pass only scoped credentials and the minimum context required for the task.
