<script lang="ts">
  import { LEGAL } from "$lib/legal.ts";
  const { publisher, retention, polling } = LEGAL;
</script>

<svelte:head>
  <title>Conditions générales d'utilisation | {LEGAL.siteName}</title>
  <meta name="description" content="Conditions d'utilisation du service d'enquêtes {LEGAL.siteName}." />
</svelte:head>

<h1>Conditions générales d'utilisation</h1>
<p>En vigueur depuis le {LEGAL.lastUpdated}.</p>

<h2>Article 1 : Objet</h2>
<p>
  Les présentes conditions générales d'utilisation (les « CGU ») définissent les modalités d'accès et
  d'utilisation du service {LEGAL.siteName} (le « Service »), exploité par {publisher.legalName}
  (l'« Institut »), institut d'études et de sondages. Le Service permet de concevoir des questionnaires,
  d'administrer des enquêtes, d'y répondre et d'en analyser les résultats.
</p>

<h2>Article 2 : Définitions</h2>
<ul>
  <li><strong>Institut :</strong> {publisher.legalName}, responsable de la conception et de la réalisation des enquêtes.</li>
  <li><strong>Enquête :</strong> questionnaire administré via le Service, pour le compte de l'Institut ou d'un Commanditaire.</li>
  <li><strong>Participant :</strong> personne qui répond à une Enquête, qu'elle soit sollicitée ou qu'elle réponde à un lien public.</li>
  <li><strong>Panéliste :</strong> Participant inscrit au panel de l'Institut et sollicité de façon récurrente.</li>
  <li><strong>Commanditaire :</strong> personne ou organisation qui commande une Enquête à l'Institut.</li>
  <li><strong>Chargé d'études :</strong> membre de l'Institut disposant d'un compte pour créer et exploiter les Enquêtes.</li>
</ul>

<h2>Article 3 : Acceptation des CGU</h2>
<p>
  L'utilisation du Service, à quelque titre que ce soit, vaut acceptation pleine et entière des présentes CGU,
  ainsi que de la <a href="/legal/deontologie">charte de déontologie</a> et de la
  <a href="/legal/confidentialite">politique de confidentialité</a>, qui en font partie intégrante.
</p>

<h2>Article 4 : Accès au Service</h2>
<p>
  Le Service est accessible gratuitement, 7 j/7 et 24 h/24, sous réserve des interruptions nécessaires à sa
  maintenance, à son évolution ou en cas de force majeure. Répondre à une Enquête ne requiert aucun compte, sauf
  lorsque l'échantillon est restreint : l'accès est alors limité à un lien nominatif, à une liste d'adresses
  autorisées, à une fenêtre de terrain ou à un quota de réponses.
</p>
<p>Les frais d'accès au réseau (matériel, connexion Internet) restent à la charge de l'utilisateur.</p>

<h2>Article 5 : Participation à une Enquête</h2>
<p>
  La participation est libre, volontaire et peut être interrompue à tout moment sans justification ni
  conséquence. Avant de commencer, le Participant est informé de l'objet de l'Enquête, de sa durée approximative
  et de l'identité de l'Institut.
</p>
<p>Le Participant s'engage à :</p>
<ul>
  <li>répondre sincèrement et personnellement, sans usurper l'identité d'un tiers ;</li>
  <li>ne participer qu'une seule fois à une même Enquête, sauf lorsque le protocole prévoit plusieurs vagues ;</li>
  <li>ne pas recourir à un automate, à un script ou à un outil de génération de réponses ;</li>
  <li>ne pas contourner les critères d'éligibilité ou les quotas, notamment en déclarant des caractéristiques inexactes.</li>
</ul>
<p>
  Les réponses manifestement incohérentes, produites en série ou en un temps incompatible avec une lecture réelle
  du questionnaire peuvent être écartées de l'analyse, sans que cette exclusion n'ouvre droit à indemnité.
</p>

<h2>Article 6 : Panel</h2>
<p>
  L'inscription au panel est libre et résiliable à tout moment, par simple demande adressée à
  <a href="mailto:{publisher.email}">{publisher.email}</a> ou via le lien de désinscription figurant dans chaque
  invitation. Le Panéliste s'engage à maintenir ses informations de profil à jour, celles-ci conditionnant la
  pertinence des échantillons.
</p>
<p>
  Lorsqu'une gratification est prévue, ses modalités sont annoncées avant le questionnaire. Elle rémunère le temps
  consacré, jamais le sens des réponses. Toute tentative de fraude (comptes multiples, réponses automatisées,
  déclarations mensongères pour accéder à une Enquête) entraîne l'exclusion du panel et la perte des
  gratifications non encore versées.
</p>
<p>
  Les coordonnées d'un Panéliste sont conservées {retention.panelInactivityMonths} mois après son dernier contact
  avec l'Institut, puis supprimées ou anonymisées.
</p>

<h2>Article 7 : Ce que l'Institut s'interdit</h2>
<ul>
  <li>utiliser une Enquête comme prétexte à de la prospection commerciale ou à une collecte de fonds ;</li>
  <li>céder, louer ou communiquer les coordonnées des Participants à des fins de démarchage ;</li>
  <li>livrer à un Commanditaire des réponses nominatives ou permettant de réidentifier une personne ;</li>
  <li>publier un résultat de façon à en déformer le sens, ou présenter comme représentative une consultation qui ne l'est pas.</li>
</ul>

<h2>Article 8 : Comportements interdits</h2>
<p>Sont proscrits, sur l'ensemble du Service :</p>
<ul>
  <li>l'accès ou le maintien frauduleux dans le système d'information (art. 323-1 du code pénal) ;</li>
  <li>l'altération du fonctionnement du Service, y compris par saturation volontaire ou soumissions massives ;</li>
  <li>l'extraction systématique des questionnaires ou des résultats, notamment par moissonnage automatisé ;</li>
  <li>l'usurpation de l'identité d'un tiers, de l'Institut ou d'un Commanditaire ;</li>
  <li>la diffusion de contenu illicite, diffamatoire ou haineux dans une réponse libre.</li>
</ul>

<h2>Article 9 : Confidentialité des questionnaires</h2>
<p>
  Le contenu d'une Enquête, notamment lorsqu'il porte sur un produit, une campagne ou une hypothèse non encore
  rendus publics, est confidentiel. Le Participant s'interdit de le reproduire, de le diffuser ou d'en publier des
  captures avant la publication officielle des résultats.
</p>

<h2>Article 10 : Comptes internes</h2>
<p>
  Les comptes de Chargés d'études sont créés par l'Institut. Leur titulaire s'engage à conserver ses identifiants
  confidentiels et à signaler sans délai toute utilisation non autorisée ; toute action réalisée depuis un compte
  est réputée effectuée par son titulaire. Une session expire automatiquement au bout de
  {retention.sessionDays} jours, et un compte inactif depuis plus de {retention.inactiveAccountMonths} mois peut
  être supprimé après information de son titulaire.
</p>

<h2>Article 11 : Fichiers téléversés</h2>
<p>
  Les fichiers joints à une réponse sont stockés hors racine web, sous un nom aléatoire, et ne sont accessibles
  qu'aux Chargés d'études habilités sur l'Enquête concernée. L'Institut se réserve le droit de supprimer sans
  préavis tout fichier manifestement illicite ou dangereux.
</p>

<h2>Article 12 : Gratifications et paiements</h2>
<p>
  L'accès au Service est gratuit et répondre à une Enquête n'est jamais payant. Lorsqu'un questionnaire comporte
  un champ de paiement (inscription à un évènement, participation à des frais), la transaction est opérée par le
  prestataire de paiement retenu, selon ses propres conditions ; l'Institut ne conserve aucune donnée bancaire.
</p>

<h2>Article 13 : Propriété intellectuelle et exploitation des résultats</h2>
<p>
  Les questionnaires, les méthodologies d'échantillonnage et de redressement, les résultats et les analyses sont
  la propriété de l'Institut, sous réserve des droits concédés contractuellement au Commanditaire. Le Participant
  concède à l'Institut le droit d'exploiter ses réponses de façon agrégée et anonyme, y compris pour des
  publications ultérieures.
</p>
<p>
  Toute reprise publique de résultats doit citer l'Institut, le Commanditaire, la taille de l'échantillon, les
  dates de terrain et les marges d'erreur, dans les conditions fixées par la
  <a href="/legal/deontologie">charte de déontologie</a>.
  {#if polling.electoralPolls}
    Pour les sondages liés à un débat électoral, ces mentions sont imposées par la loi du 19 juillet 1977.
  {/if}
</p>

<h2>Article 14 : Données personnelles et cookies</h2>
<p>
  Les traitements de données personnelles sont décrits dans la
  <a href="/legal/confidentialite">politique de confidentialité</a> ; les traceurs déposés sont détaillés dans la
  <a href="/legal/cookies">page consacrée aux cookies</a>.
</p>

<h2>Article 15 : Disponibilité, maintenance et évolutions</h2>
<p>
  L'Institut s'efforce d'assurer la disponibilité du Service sans être tenu à une obligation de résultat. Il peut
  faire évoluer, suspendre ou interrompre tout ou partie du Service, en informant les utilisateurs concernés dans
  un délai raisonnable lorsque l'interruption est programmée et durable.
</p>

<h2>Article 16 : Responsabilité</h2>
<p>
  L'Institut ne saurait être tenu responsable des dommages indirects résultant de l'utilisation du Service, ni du
  contenu des réponses libres rédigées par les Participants, ni de l'interprétation qu'un tiers ferait de
  résultats publiés hors de leur contexte méthodologique, ni des conséquences d'une perte d'identifiants
  imputable à l'utilisateur.
</p>

<h2>Article 17 : Suspension et exclusion</h2>
<p>
  En cas de manquement aux présentes CGU, l'Institut peut, après mise en demeure restée sans effet pendant sept
  jours, ou sans délai en cas de manquement grave ou d'illicéité manifeste, suspendre l'accès au Service, écarter
  les réponses concernées de l'analyse ou exclure la personne du panel.
</p>

<h2>Article 18 : Modification des CGU</h2>
<p>
  Les présentes CGU peuvent être modifiées à tout moment. La version applicable est celle en ligne au moment de
  l'utilisation du Service ; les modifications substantielles sont portées à la connaissance des Panélistes par
  courrier électronique.
</p>

<h2>Article 19 : Droit applicable et litiges</h2>
<p>
  Les présentes CGU sont soumises au droit français. En cas de différend, les parties rechercheront une solution
  amiable ; une réclamation peut être adressée à <a href="mailto:{publisher.email}">{publisher.email}</a>. À
  défaut d'accord, le litige sera porté devant les juridictions françaises compétentes.
  {#if polling.electoralPolls}
    Les contestations relatives à un sondage électoral relèvent en outre de la
    <a href={polling.commissionUrl} rel="noopener noreferrer" target="_blank">commission des sondages</a>.
  {/if}
</p>
