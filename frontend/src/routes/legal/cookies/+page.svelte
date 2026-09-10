<script lang="ts">
  import { LEGAL } from "$lib/legal.ts";
  const { publisher, retention } = LEGAL;
</script>

<svelte:head>
  <title>Gestion des cookies | {LEGAL.siteName}</title>
  <meta name="description" content="Cookies déposés par {LEGAL.siteName} : aucun traceur publicitaire ni mesure d'audience." />
</svelte:head>

<h1>Gestion des cookies</h1>
<p>Information au titre de l'article 82 de la loi n° 78-17 du 6 janvier 1978 modifiée.</p>

<div class="note">
  <p class="!mb-0">
    <strong>Aucun traceur, aucune bannière.</strong> Le Service ne dépose ni cookie publicitaire, ni cookie de
    mesure d'audience, ni bouton de réseau social. Les seuls cookies utilisés sont strictement nécessaires au
    fonctionnement du service : ils sont exemptés de consentement, ce qui explique l'absence de bandeau.
  </p>
</div>

<h2>1. Qu'est-ce qu'un cookie ?</h2>
<p>
  Un cookie est un petit fichier déposé par un site dans le navigateur, puis renvoyé à chaque requête. Il permet
  par exemple de maintenir une session ouverte d'une page à l'autre.
</p>

<h2>2. Cookies déposés</h2>
<table>
  <thead>
    <tr>
      <th>Nom</th>
      <th>Finalité</th>
      <th>Durée</th>
      <th>Catégorie</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>session</code></td>
      <td>
        Maintient la connexion d'un administrateur. Contient un jeton aléatoire, jamais de données personnelles.
        Cookie <em>HttpOnly</em>, inaccessible au JavaScript, et <em>Secure</em> en production.
      </td>
      <td>{retention.sessionDays} jours</td>
      <td>Strictement nécessaire</td>
    </tr>
    <tr>
      <td><code>csrf</code></td>
      <td>
        Protège contre la falsification de requête intersites : sa valeur est renvoyée dans un en-tête à chaque
        écriture et comparée à celle de la session.
      </td>
      <td>{retention.sessionDays} jours</td>
      <td>Strictement nécessaire</td>
    </tr>
  </tbody>
</table>
<p>
  Un visiteur qui se contente de remplir un formulaire public ne reçoit aucun de ces cookies : ils ne sont posés
  qu'à la connexion d'un administrateur. Ils sont supprimés à la déconnexion.
</p>

<h2>3. Cookies non utilisés</h2>
<ul>
  <li>aucun cookie publicitaire ou de reciblage ;</li>
  <li>aucune mesure d'audience (ni Google Analytics, ni Matomo, ni équivalent) ;</li>
  <li>aucun cookie tiers de réseau social ;</li>
  <li>aucun partage d'identifiant avec un tiers.</li>
</ul>

<h2>4. Stockage local</h2>
<p>
  Le Service n'utilise pas le stockage local du navigateur (<code>localStorage</code>, <code>sessionStorage</code>)
  pour identifier ou suivre les visiteurs.
</p>

<h2>5. Ressource externe</h2>
<p>
  La police de caractères « Outfit » est chargée depuis Google Fonts. Ce chargement ne dépose pas de cookie, mais
  transmet l'adresse IP du visiteur à Google. Cette dépendance a vocation à être internalisée ; son blocage par le
  navigateur n'empêche pas l'usage du Service.
</p>

<h2>6. Refuser ou supprimer les cookies</h2>
<p>
  Les cookies peuvent être supprimés ou bloqués depuis les réglages du navigateur (Firefox, Chrome, Edge, Safari :
  rubrique « Confidentialité »). Le blocage du cookie <code>session</code> empêche toutefois la connexion à
  l'espace d'administration ; la consultation et l'envoi des formulaires publics restent possibles.
</p>

<h2>7. Contact</h2>
<p>
  Toute question relative aux cookies peut être adressée à
  <a href="mailto:{publisher.email}">{publisher.email}</a>. Voir également la
  <a href="/legal/confidentialite">politique de confidentialité</a>.
</p>
