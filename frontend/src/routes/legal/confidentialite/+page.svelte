<script lang="ts">
  import { LEGAL } from "$lib/legal.ts";
  const { publisher, dpo, retention } = LEGAL;
</script>

<svelte:head>
  <title>Politique de confidentialité | {LEGAL.siteName}</title>
  <meta
    name="description"
    content="Données collectées, finalités, durées de conservation et droits RGPD sur {LEGAL.siteName}."
  />
</svelte:head>

<h1>Politique de confidentialité</h1>
<p>
  Information des personnes concernées au titre des articles 12 à 14 du règlement (UE) 2016/679 (RGPD) et de la
  loi n° 78-17 du 6 janvier 1978 modifiée.
</p>

<div class="note">
  <p class="!mb-0">
    <strong>Deux rôles à distinguer.</strong> {publisher.legalName} est responsable de traitement pour les comptes
    administrateurs et le fonctionnement technique du site. Pour le contenu des formulaires, c'est
    l'organisation qui publie le formulaire qui est responsable de traitement ; l'association agit alors comme
    sous-traitant (art. 28 RGPD) et n'exploite jamais les réponses pour son propre compte.
  </p>
</div>

<h2>1. Responsable de traitement</h2>
<ul>
  <li>{publisher.legalName}, {publisher.form}, RNA {publisher.rna}</li>
  <li>{publisher.address}</li>
  <li>Contact : <a href="mailto:{publisher.email}">{publisher.email}</a></li>
  {#if dpo.designated}
    <li>Délégué à la protection des données : <a href="mailto:{dpo.email}">{dpo.email}</a></li>
  {:else}
    <li>Aucun délégué à la protection des données n'est désigné ; les demandes sont traitées à l'adresse ci-dessus.</li>
  {/if}
</ul>

<h2>2. Données collectées et finalités</h2>
<table>
  <thead>
    <tr>
      <th>Traitement</th>
      <th>Données</th>
      <th>Base légale</th>
      <th>Conservation</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Compte administrateur</td>
      <td>Adresse électronique, nom affiché, mot de passe (empreinte irréversible), rôle, organisation</td>
      <td>Exécution des CGU (art. 6.1.b)</td>
      <td>Durée du compte, puis {retention.inactiveAccountMonths} mois d'inactivité</td>
    </tr>
    <tr>
      <td>Sessions et sécurité</td>
      <td>Jeton de session (haché), empreinte de l'adresse IP, agent utilisateur, jeton anti-CSRF</td>
      <td>Intérêt légitime : sécuriser l'accès (art. 6.1.f)</td>
      <td>{retention.sessionDays} jours, purge automatique horaire</td>
    </tr>
    <tr>
      <td>Réponses aux formulaires</td>
      <td>Champs remplis par le répondant, fichiers joints, date de soumission</td>
      <td>Consentement du répondant ou base définie par le responsable du formulaire</td>
      <td>{retention.responsesMonths} mois par défaut, ou durée fixée par le responsable du formulaire</td>
    </tr>
    <tr>
      <td>Traçabilité des soumissions</td>
      <td>Empreinte de l'adresse IP et agent utilisateur (<strong>jamais collectés</strong> si le formulaire est configuré comme anonyme)</td>
      <td>Intérêt légitime : lutte contre les envois abusifs (art. 6.1.f)</td>
      <td>Supprimés avec la réponse associée</td>
    </tr>
    <tr>
      <td>Journaux techniques</td>
      <td>Horodatage, méthode et chemin de la requête, code de réponse</td>
      <td>Intérêt légitime : diagnostic et sécurité (art. 6.1.f)</td>
      <td>12 mois maximum</td>
    </tr>
  </tbody>
</table>

<h3>Données non collectées</h3>
<p>
  Le Service ne pratique aucun profilage, aucune décision automatisée, aucune publicité et aucune revente de
  données. Aucun cookie de mesure d'audience ou de réseau social n'est déposé : voir la
  <a href="/legal/cookies">page cookies</a>.
</p>

<h2>3. Caractère obligatoire des réponses</h2>
<p>
  Les champs marqués comme obligatoires dans un formulaire conditionnent son envoi ; les autres sont facultatifs.
  Lorsqu'un formulaire l'exige, une case de consentement doit être cochée avant la soumission. Le consentement
  peut être retiré à tout moment, sans effet sur les traitements déjà réalisés.
</p>

<h2>4. Destinataires</h2>
<ul>
  <li>les administrateurs habilités sur le formulaire concerné, et eux seuls ;</li>
  <li>l'hébergeur du site, en qualité de sous-traitant technique (voir <a href="/legal/mentions-legales">mentions légales</a>) ;</li>
  <li>le service d'envoi de courriels utilisé pour les notifications et les accusés de réception, le cas échéant ;</li>
  <li>
    le service tiers destinataire d'un webhook, lorsqu'un administrateur en a configuré un sur son formulaire : les
    réponses sont alors transmises à l'adresse qu'il a indiquée, sous sa seule responsabilité.
  </li>
</ul>
<p>Aucune donnée n'est transférée hors de l'Union européenne par le Service lui-même.</p>

<h2>5. Sécurité</h2>
<ul>
  <li>chiffrement des échanges en HTTPS ;</li>
  <li>mots de passe stockés sous forme d'empreintes irréversibles, jamais en clair ;</li>
  <li>chiffrement optionnel des réponses au repos (AES-256-GCM), activable formulaire par formulaire ;</li>
  <li>adresses IP conservées uniquement sous forme d'empreinte, jamais en clair ;</li>
  <li>cookie de session <em>HttpOnly</em> et protection anti-CSRF sur toutes les écritures ;</li>
  <li>limitation de débit sur l'authentification et les soumissions ;</li>
  <li>fichiers téléversés stockés hors racine web, sous un nom aléatoire, servis uniquement aux administrateurs autorisés.</li>
</ul>

<h2>6. Vos droits</h2>
<p>
  Toute personne dispose d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de
  portabilité, ainsi que du droit de définir des directives relatives au sort de ses données après son décès.
</p>
<ul>
  <li>
    <strong>Pour une réponse à un formulaire :</strong> adressez-vous d'abord à l'organisation qui a publié ce
    formulaire, indiquée dans son intitulé ou son descriptif. Elle en est responsable.
  </li>
  <li>
    <strong>Pour un compte administrateur ou une question technique :</strong> écrivez à
    <a href="mailto:{publisher.email}">{publisher.email}</a>. Une réponse est apportée dans un délai d'un mois,
    prolongeable de deux mois en cas de demande complexe.
  </li>
</ul>
<p>
  En cas de réponse insatisfaisante, une réclamation peut être introduite auprès de la CNIL : 3 place de
  Fontenoy, TSA 80715, 75334 Paris Cedex 07,
  <a href="https://www.cnil.fr/fr/plaintes" rel="noopener noreferrer" target="_blank">www.cnil.fr/fr/plaintes</a>.
</p>

<h2>7. Violation de données</h2>
<p>
  En cas de violation susceptible d'engendrer un risque pour les droits et libertés des personnes, la CNIL est
  notifiée dans les 72 heures et les personnes concernées sont informées lorsque le risque est élevé.
</p>

<h2>8. Ressources externes</h2>
<p>
  Les pages du Service chargent la police de caractères « Outfit » depuis Google Fonts. Ce chargement transmet
  l'adresse IP du visiteur à Google. Cette dépendance sera internalisée ; en attendant, un blocage de ce domaine
  par le navigateur n'empêche pas l'utilisation du Service, seule la police de repli change.
</p>

<h2>9. Modification de la présente politique</h2>
<p>
  La présente politique peut être mise à jour pour refléter une évolution du Service ou de la réglementation. La
  date de dernière révision figure en bas de page.
</p>
