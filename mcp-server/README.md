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

## Endpoint HTTP (sans rien installer)

Le backend expose les mêmes outils en HTTP sur `/api/mcp` (Streamable HTTP, sans
état), donc sur `https://forms.klaynight.fr/api/mcp`. La clé d'API se passe :

- en URL, pour les connecteurs personnalisés de claude.ai :
  `https://forms.klaynight.fr/api/mcp?key=ofk_...` (l'URL est alors un secret) ;
- ou en en-tête `Authorization: Bearer ofk_...` pour Claude Code :
  `claude mcp add --transport http openforms https://forms.klaynight.fr/api/mcp --header "Authorization: Bearer ofk_..."`

Les outils sont définis une seule fois, dans `backend/src/mcp/server.ts` : le
backend les sert en HTTP, et `mcp-server/src/index.ts` les sert en stdio.

## Variables d'environnement

| Variable             | Défaut                  | Rôle                          |
| -------------------- | ----------------------- | ----------------------------- |
| `OPENFORMS_API_URL`  | `http://localhost:3000` | Base de l'API Openforms       |
| `OPENFORMS_API_KEY`  | —                       | Clé personnelle (obligatoire) |
| `OPENFORMS_APP_URL`  | `OPENFORMS_API_URL`     | Origine des liens renvoyés    |

## Outils exposés

**Organisations** : `list_organizations`, `list_organization_members`,
`create_organization`, `invite_organization_member`.

**Formulaires** : `list_forms`, `get_form`, `create_form` (avec ses questions),
`update_form_settings`, `set_form_published`, `duplicate_form`, `delete_form`,
`move_form_to_organization`, `share_form`, `unshare_form`, `list_form_versions`,
`restore_form_version`.

**Questions** : `add_questions`, `update_question`, `delete_question`,
`move_question`. Elles passent par les mêmes opérations que l'éditeur : les
personnes qui ont le formulaire ouvert voient les changements en direct, sans
conflit avec leurs propres modifications.

**Réponses** : `list_responses` (pagination, filtres), `get_response`,
`submit_response` (validée, comme un participant), `add_response` (saisie
manuelle du tableur), `update_response`, `delete_response`.

**Statistiques** : `get_form_stats` (résultats question par question),
`cross_tabulate` (tableau croisé de deux questions), `get_global_stats`
(super-admin), et les presets de croisement de la page Statistiques
(`list_stats_presets`, `create_stats_preset`, `update_stats_preset`,
`delete_stats_preset`). Les statistiques sont calculées sur les réponses, avec
filtres par période et par réponse à d'autres questions.

**Commentaires** : `list_comments`, `add_comment`, `resolve_comment`,
`delete_comment`.

## Développement

```bash
bun run --cwd mcp-server check   # typecheck
bun run --cwd mcp-server start   # lancement manuel (stdio)
```

Le transport stdio réserve `stdout` au protocole MCP : toute trace doit partir
sur `stderr`.
