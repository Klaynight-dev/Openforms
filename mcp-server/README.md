# Serveur MCP Openforms

Expose les formulaires, statistiques et presets de croisement d'Openforms à un
client compatible MCP (Claude Desktop, Claude Code…), en lecture **et** en
configuration.

## Principe

Le serveur ne touche jamais la base de données : il appelle la même API REST que
l'interface web, authentifié par une **clé d'API personnelle**. Les droits sont
donc exactement ceux du compte porteur de la clé — propriétaire, membre
d'organisation, `FormAccess`, rôle `SUPER_ADMIN`. Aucune élévation de privilège
n'est possible depuis le MCP.

## Mise en route

1. **Créer une clé d'API** dans Openforms (`POST /api/v1/api-keys`, ou l'écran
   Réglages une fois l'interface branchée). Le token n'est affiché **qu'une
   fois** : seul son SHA-256 est stocké.

2. **Déclarer le serveur** chez le client MCP. Exemple pour Claude Desktop
   (`claude_desktop_config.json`) :

```json
{
  "mcpServers": {
    "openforms": {
      "command": "bun",
      "args": ["run", "/chemin/vers/Openforms/mcp-server/src/index.ts"],
      "env": {
        "OPENFORMS_API_URL": "http://localhost:3000",
        "OPENFORMS_API_KEY": "ofk_..."
      }
    }
  }
}
```

Pour Claude Code : `claude mcp add openforms --env OPENFORMS_API_KEY=ofk_... -- bun run /chemin/vers/mcp-server/src/index.ts`

## Variables d'environnement

| Variable             | Défaut                  | Rôle                          |
| -------------------- | ----------------------- | ----------------------------- |
| `OPENFORMS_API_URL`  | `http://localhost:3000` | Base de l'API Openforms       |
| `OPENFORMS_API_KEY`  | —                       | Clé personnelle (obligatoire) |

## Outils exposés

**Lecture** — `list_organizations`, `list_forms`, `get_form`, `get_form_stats`,
`get_global_stats` (super-admin), `list_stats_presets`.

**Configuration** — `update_form_settings`, `set_form_published`,
`create_stats_preset`, `update_stats_preset`, `delete_stats_preset`,
`grant_form_access`, `revoke_form_access` (les deux derniers réservés aux super
administrateurs).

`update_form_settings` relit le formulaire avant d'écrire et réémet sa structure
telle quelle : les champs du formulaire ne peuvent pas être altérés par le MCP.
Les modifications de structure passent par le builder.

## Développement

```bash
bun run --cwd mcp-server check   # typecheck
bun run --cwd mcp-server start   # lancement manuel (stdio)
```

Le transport stdio réserve `stdout` au protocole MCP : toute trace doit partir
sur `stderr`.
