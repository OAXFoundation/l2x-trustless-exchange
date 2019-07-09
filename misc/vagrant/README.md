## Vagrant configuration to test operator server locally

Prequisites: `virtualbox`, `vagrant`.

On nixos:

1. Put `virtualisation.virtualbox.host.enable = true;` in `configuration.nix`.
2. Run a nix-shell with vagrant: `nix-shell -p vagrant`

## Usage
Make sure you are in this directory.

```
vagrant up
```

Setup vagrant box (password for copying key is `vagrant`):
``` 
ssh-copy-id ssh://vagrant@localhost:2222
cat configuration.nix | ssh ssh://vagrant@localhost:2222 sudo tee /etc/nixos/configuration.nix
ssh ssh://vagrant@localhost:2222 sudo nixos-rebuild switch
```
The last line will give show some expected errors because it's trying to start
the operator service and we haven't deployed it yet.

To test the deployment script

```bash
env SSH_CON=ssh://vagrant@localhost:2222 deploy-operator
```
If you need to deploy a docker image with another version (e. g. `latest`)
``` bash
env SSH_CON=ssh://vagrant@localhost:2222 VERSION=latest deploy-operator
```

Note: To run a working operator you would also need a `.env` file in
`/home/vagrant/.env` and a wallet for the operator at
`/home/vagrant/mount/wallet.bin`. 
