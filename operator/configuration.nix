{pkgs, ...}:

{
  imports = [ <nixpkgs/nixos/modules/virtualisation/amazon-image.nix> ];
  ec2.hvm = true;

  networking.firewall.allowedTCPPorts = [ 8899 ];

  systemd.services.operator = {
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      description = "Start the operator.";
      serviceConfig = {
        Environment="NIX_PATH=/root/.nix-defexpr/channels:nixpkgs=/nix/var/nix/profiles/per-user/root/channels/nixos:nixos-config=/etc/nixos/configuration.nix:/nix/var/nix/profiles/per-user/root/channels";
        WorkingDirectory = "/root/dist";
        ExecStart = "${pkgs.docker}/bin/docker start -a oax";
        ExecStop = "${pkgs.docker}/bin/docker stop oax";
      };
   };

   #environment.systemPackages = [ pkgs.screen ];

  security.pam.services.sudo.sshAgentAuth = true;
  security.pam.enableSSHAgentAuth = true;
  programs.fish.enable = true;
  virtualisation.docker.enable = true;

  #users.users.foo = {
  #  isNormalUser = true;
  #  extraGroups = [ "wheel" "docker" ];
  #  shell = pkgs.fish;
  #  openssh.authorizedKeys.keys = [
  #    "ssh-rsa AAA..."
  #  ];
  #};

}
