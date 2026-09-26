{ pkgs, ... }:

{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
  };

  services.postgres = {
    enable = true;
    package = pkgs.postgresql_17;
    extensions = extensions: [ extensions.postgis ];
    initialDatabases = [
      {
        name = "cybermap";
        initialSQL = "CREATE EXTENSION IF NOT EXISTS postgis;";
      }
    ];
  };

  enterTest = ''
    test "$(node --version | cut -d. -f1)" = "v24"
    npm ci --prefix api --ignore-scripts --engine-strict
    npm ci --prefix vm/cybermap-api --ignore-scripts --engine-strict
    npm test --prefix vm/cybermap-api
    psql cybermap -Atc "SELECT PostGIS_Version();" | grep -E '.+'
    # Match the existing hosted-CI boundary: Obscura is a separate browser CLI
    # and is not part of the Node/PostGIS environment being tested here.
    node --test --test-skip-pattern='^Obscura ' tests/*.test.mjs
  '';
}
