FROM nixos/nix

WORKDIR /app/src
CMD nix-shell ../shell.nix --argstr env prod --run "node server/main.js"
ENV NODE_ENV docker

# Dependencies
COPY package.json /app/
COPY shell.nix /app/
COPY nixpkgs.json /app/
RUN nix-shell ../shell.nix --argstr env prod --run "npm install --only=production"

# Our application
COPY .env /app/src/
COPY .contract_build_root /app/
COPY contracts/ /app/build/contracts/
COPY config/ /app/config/
COPY src/ /app/src/
COPY public/ /app/public/
