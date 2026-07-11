import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const moduleBicep = readFileSync('infra/modules/postgres-flexible.bicep', 'utf8');
const mainBicep = readFileSync('infra/main.bicep', 'utf8');
const params = JSON.parse(readFileSync('infra/main.parameters.json', 'utf8'));
const deployWorkflow = readFileSync('.github/workflows/deploy-static-web-app.yml', 'utf8');
const whatIfWorkflow = readFileSync('.github/workflows/infra-whatif.yml', 'utf8');

test('PostgreSQL Flexible Server module is private B1MS with P0 storage and backups', () => {
  assert.match(moduleBicep, /Microsoft\.DBforPostgreSQL\/flexibleServers@2024-08-01/);
  assert.match(moduleBicep, /name:\s*skuName\s*\n\s*tier:\s*'Burstable'/);
  assert.match(moduleBicep, /'Standard_B1ms'/);
  assert.match(moduleBicep, /storageSizeGB:\s*storageSizeGB/);
  assert.match(moduleBicep, /@minValue\(32\)\s*\nparam storageSizeGB int = 32/);
  assert.match(moduleBicep, /backupRetentionDays:\s*backupRetentionDays/);
  assert.match(moduleBicep, /@minValue\(7\)\s*\n@maxValue\(35\)\s*\nparam backupRetentionDays int = 7/);
  assert.match(moduleBicep, /delegatedSubnetResourceId:\s*postgresSubnetId/);
  assert.match(moduleBicep, /privateDnsZoneArmResourceId:\s*privateDnsZoneId/);
  assert.match(moduleBicep, /publicNetworkAccess:\s*'Disabled'/);
});

test('PostGIS-ready database is created without secret outputs', () => {
  assert.match(moduleBicep, /flexibleServers\/databases@2024-08-01/);
  assert.match(moduleBicep, /name:\s*'azure\.extensions'/);
  assert.match(moduleBicep, /value:\s*azureExtensions/);
  assert.match(moduleBicep, /POSTGIS,PGCRYPTO/);
  const moduleOutputLines = moduleBicep.split('\n').filter((line) => line.trimStart().startsWith('output '));
  const mainOutputLines = mainBicep.split('\n').filter((line) => line.trimStart().startsWith('output '));
  assert.equal(moduleOutputLines.some((line) => /password/i.test(line)), false);
  assert.equal(mainOutputLines.some((line) => /password/i.test(line)), false);
});

test('Main deployment wires PostgreSQL to shared networking outputs', () => {
  assert.match(mainBicep, /module postgresModule 'modules\/postgres-flexible\.bicep'/);
  assert.match(mainBicep, /postgresSubnetId:\s*networkModule\.outputs\.postgresSubnetId/);
  assert.match(mainBicep, /privateDnsZoneId:\s*networkModule\.outputs\.postgresPrivateDnsZoneId/);
  assert.match(mainBicep, /@secure\(\)\s*\n@description\('PostgreSQL administrator password/);
  assert.match(mainBicep, /output postgresHostName string = postgresModule\.outputs\.hostName/);
  assert.match(mainBicep, /output postgresPort int = postgresModule\.outputs\.port/);
  assert.match(mainBicep, /output postgresDatabaseName string = postgresModule\.outputs\.databaseName/);
  assert.match(mainBicep, /output postgresAdministratorLogin string = postgresModule\.outputs\.administratorLogin/);
});

test('Parameters and workflows keep PostgreSQL password out of committed parameter files', () => {
  assert.equal(params.parameters.postgresServerName.value, 'blue-swallow-pg');
  assert.equal(params.parameters.postgresDatabaseName.value, 'cybermap');
  assert.equal(params.parameters.postgresAdministratorLogin.value, 'cybermapadmin');
  assert.equal(params.parameters.postgresVersion.value, '16');
  assert.equal(Object.hasOwn(params.parameters, 'postgresAdministratorPassword'), false);
  assert.match(deployWorkflow, /POSTGRES_ADMIN_PASSWORD/);
  assert.match(deployWorkflow, /--parameters postgresAdministratorPassword="\$postgres_password"/);
  assert.match(whatIfWorkflow, /--parameters postgresAdministratorPassword="\$postgres_password"/);
});
