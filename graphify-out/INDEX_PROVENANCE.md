# Index-bound Graphify Provenance

## Derivation

- Source staged-index tree: `1f08f02abb433ac70a24c612684e0e14af36a6b8`
- Temporary detached extraction commit: `998e8f29725536c2446765ffffc0ab81107adfa6`
- Tree invariant: the extraction commit resolves to the source staged-index tree.
- Generator: `graphify update .` ran in the detached extraction worktree.

The extraction index removed the generated Graphify outputs before the source tree was written. Therefore the generated artifacts and this provenance record are staged after extraction; the final review tree legitimately differs from the source staged-index tree by those derived files only.

## Scope boundary

The extraction was constructed from the Git index. Untracked worktree content was not included. The graph remains local and contains no protected credential or proof-environment material.
