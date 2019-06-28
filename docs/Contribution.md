# Contribution Guidelines

## Conventions

#### Commit Messages
- Use present tense.
- Max line length: header 50 characters, body 72 characters.

A short example

    [#123] Problem: One-line summary of the problem

    Solution: One-line summary of the solution.

A longer example

    [#123] Problem: One-line summary of the problem

    Solution: One-line summary of the solution.

    Optionally a more detailed description of the problem using
    multiple paragraphs or bullet points if desired.

    Optionally a more detailed description of the solution using
    multiple paragraphs or bullet points if desired.

    Closes #121. [[If closing issues with commit]]
    Closes #119.

These formats are inspired by suggestions in the [Collective Code Construction
Contract](https://rfc.zeromq.org/spec:42/C4/).

#### Code
- Follow the [Solidity style
guide](https://solidity.readthedocs.io/en/latest/style-guide.html) for all solidity
code.
- You can use [solium](https://github.com/duaraghav8/Solium) to catch some
  issues with the solidity code: `solium -d contracts/`
- Run `pnpm run format` to autoformat `js/ts` files, or better install a plugin
  for your editor. You can run `pnpm run check-format` to check if the
  formatting is okay.

### Updating nixpkgs
To update `nixpkgs.json` to the latest commit on master or a specific `rev`

```bash
misc/update-nix        # for latest
misc/update-nix $rev   # specific commit
```


* * *
&copy; 2019 OAX Foundation
