import { seed as seedM365Roles } from "./m365-roles.js";

const seeds = [{ name: "m365-roles", fn: seedM365Roles }];

for await (const { name, fn } of seeds) {
  console.log(`Running seed: ${name}`);
  await fn();
  console.log(`Done: ${name}`);
}
