{ env ? "dev" }:
let
  pkgs = import <nixpkgs> { };
  pinnedNixpkgs = pkgs.lib.importJSON ./nixpkgs.json;
in
with import (
  builtins.fetchTarball {
    url = pinnedNixpkgs.url;
    sha256 = pinnedNixpkgs.sha256;
  }
) { };

let
  geth = go-ethereum.overrideAttrs (old: rec {
    version = "1.8.27";
    src = fetchFromGitHub {
      owner = "ethereum";
      repo = "go-ethereum";
      rev = "v${version}";
      sha256 = "1640y7lqy7bvjjgx6wp0cnbw632ls5fj4ixclr819lfz4p5dfhx1";
    };
  });
  nodejs = nodejs-10_x;
  pnpmPkg = nodePackages_10_x.pnpm;
  # npm ERR! Unsupported URL Type "link:": link:../../privatePackages/assert-project
  pnpm = (pnpmPkg.override (old: {
      preRebuild = ''
        sed -i 's|link:|file:|' package.json
      '';
  }));

  devBuildInputs = [
    awscli
    entr
    geth
    grc        # colorize output with grcat
    gnumake
    hivemind
    jq
    plantuml
    pnpm
    rsync
    solc
    utillinux  # for rev
  ];
in mkShell {
  buildInputs = [
    python2    # for buildihng scyrpt
    gmp        # For faster signing
    nodejs
  ] ++ lib.optional (env == "dev") devBuildInputs;

  shellHook = ''
    export PATH=$(pwd)/bin:$(pwd)/node_modules/.bin:$PATH

    print_module_version="console.log(process.versions.modules)"
    export npm_config_store=''${NPM_STORE_PREFIX-$HOME}/.pnpm-store-abi-$(${nodejs}/bin/node -e $print_module_version)
  '';
}
