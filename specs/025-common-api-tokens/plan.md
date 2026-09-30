# Plan

Ship one runtime-neutral CJS validator with thin Functions and VM wrappers. Add JOSE to the VM package; include the canonical file in the current Functions artifact. Existing owner read paths accept verified API tokens. With API configuration, Web code flow requests Owner.Read and uses MSAL's bounded in-process cache during the five-minute session. No OBO/new hosting/cache service or mutation proof. Keep upload migration separate from the validator primitive.
