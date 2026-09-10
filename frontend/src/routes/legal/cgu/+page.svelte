<script lang="ts">
  import { LEGAL } from "$lib/legal.ts";
  const { publisher, retention } = LEGAL;
</script>

<svelte:head>
  <title>Conditions générales d'utilisation | {LEGAL.siteName}</title>
  <meta name="description" content="Conditions générales d'utilisation du service {LEGAL.siteName}." />
</svelte:head>

<h1>Conditions générales d'utilisation</h1>
<p>En vigueur depuis le {LEGAL.lastUpdated}.</p>

<h2>Article 1 : Objet</h2>
<p>
  Les présentes conditions générales d'utilisation (les « CGU ») définissent les modalités d'accès et
  d'utilisation du service {LEGAL.siteName} (le « Service »), édité par {publisher.legalName}
  (l'« Éditeur »). Le Service permet de créer des formulaires en ligne, de les diffuser et d'en exploiter les
  réponses.
</p>

<h2>Article 2 : Définitions</h2>
<ul>
  <li><strong>Administrateur :</strong> personne disposant d'un compte lui permettant de créer et gérer des formulaires.</li>
  <li><strong>Répondant :</strong> personne qui remplit un formulaire publié, sans nécessairement disposer d'un compte.</li>
  <li><strong>Formulaire :</strong> questionnaire créé par un Administrateur et accessible via un lien public ou restreint.</li>
  <li><strong>Réponse :</strong> ensemble des données transmises par un Répondant lors de la soumission d'un Formulaire.</li>
</ul>

<h2>Article 3 : Acceptation des CGU</h2>
<p>
  L'utilisation du Service, à quelque titre que ce soit, vaut acceptation pleine et entière des présentes CGU.
  Toute personne qui ne les accepte pas doit renoncer à utiliser le Service.
</p>

<h2>Article 4 : Accès au Service</h2>
<p>
  Le Service est accessible gratuitement, 7 j/7 et 24 h/24, sous réserve des interruptions nécessaires à sa
  maintenance, à son évolution ou en cas de force majeure. L'accès aux fonctions d'administration suppose la
  création d'un compte ; l'accès aux formulaires publiés ne requiert aucun compte, sauf restriction décidée par
  l'Administrateur (formulaire à visibilité restreinte, liste d'adresses autorisées, fenêtre de publication ou
  quota de réponses).
</p>
<p>Les frais d'accès au réseau (matériel, connexion Internet) restent à la charge de l'utilisateur.</p>

<h2>Article 5 : Compte administrateur</h2>
<p>
  La création d'un compte requiert une adresse électronique valide et un mot de passe. Le titulaire du compte
  s'engage à fournir des informations exactes, à conserver ses identifiants confidentiels et à signaler sans
  délai toute utilisation non autorisée. Toute action réalisée depuis un compte est réputée effectuée par son
  titulaire.
</p>
<p>
  Une session ouverte expire automatiquement au bout de {retention.sessionDays} jours. Un compte peut être
  supprimé à tout moment sur simple demande adressée à
  <a href="mailto:{publisher.email}">{publisher.email}</a>.
</p>

<h2>Article 6 : Obligations de l'Administrateur</h2>
<p>
  L'Administrateur est seul responsable des formulaires qu'il crée et des données qu'il collecte. Il s'engage
  notamment à :
</p>
<ul>
  <li>ne collecter que des données adéquates, pertinentes et limitées à la finalité poursuivie ;</li>
  <li>informer les Répondants de la finalité du traitement et recueillir leur consentement lorsqu'il est requis ;</li>
  <li>
    ne pas collecter de données sensibles (santé, opinions politiques, convictions religieuses, orientation
    sexuelle, données biométriques) sans base légale valable ni mesures de protection adaptées ;
  </li>
  <li>répondre lui-même aux demandes d'exercice de droits émanant de ses Répondants ;</li>
  <li>ne pas diffuser de contenu illicite, diffamatoire, haineux, trompeur ou portant atteinte aux droits de tiers ;</li>
  <li>ne pas utiliser le Service à des fins d'hameçonnage ou de collecte de mots de passe et coordonnées bancaires.</li>
</ul>
<p>
  À l'égard des données collectées via ses formulaires, l'Administrateur agit en qualité de responsable de
  traitement ; l'Éditeur, qui met à disposition l'infrastructure, agit en qualité de sous-traitant au sens de
  l'article 28 du RGPD.
</p>

<h2>Article 7 : Obligations du Répondant</h2>
<p>
  Le Répondant s'engage à fournir des informations exactes, à ne transmettre que des contenus dont il détient les
  droits et à ne pas téléverser de fichier contenant un programme malveillant. Il s'interdit toute tentative de
  soumission automatisée massive, de contournement des limites de débit ou d'accès non autorisé aux réponses
  d'autrui.
</p>

<h2>Article 8 : Comportements interdits</h2>
<p>Sont notamment proscrits, sur l'ensemble du Service :</p>
<ul>
  <li>l'accès ou le maintien frauduleux dans le système d'information (art. 323-1 du code pénal) ;</li>
  <li>l'altération du fonctionnement du Service, y compris par saturation volontaire ;</li>
  <li>l'extraction systématique des contenus, notamment par moissonnage automatisé ;</li>
  <li>l'usurpation de l'identité d'un tiers ou de l'Éditeur.</li>
</ul>

<h2>Article 9 : Fichiers téléversés</h2>
<p>
  Les fichiers joints à une Réponse sont stockés hors racine web et ne sont accessibles qu'aux Administrateurs
  autorisés sur le formulaire concerné. L'Éditeur se réserve le droit de supprimer sans préavis tout fichier
  manifestement illicite ou dangereux.
</p>

<h2>Article 10 : Paiements</h2>
<p>
  L'accès au Service est gratuit. Lorsqu'un formulaire comporte un champ de paiement, la transaction est opérée
  par le prestataire de paiement choisi par l'Administrateur, selon les conditions propres à ce prestataire.
  L'Éditeur n'intervient pas dans la transaction et ne conserve aucune donnée bancaire.
</p>

<h2>Article 11 : Disponibilité, maintenance et évolutions</h2>
<p>
  L'Éditeur s'efforce d'assurer la disponibilité du Service sans être tenu à une obligation de résultat. Il peut
  faire évoluer, suspendre ou interrompre tout ou partie du Service, en informant les Administrateurs dans un
  délai raisonnable lorsque l'interruption est programmée et durable.
</p>

<h2>Article 12 : Responsabilité</h2>
<p>
  L'Éditeur ne saurait être tenu responsable des dommages indirects résultant de l'utilisation du Service, ni du
  contenu des formulaires et des réponses, ni de l'usage qu'un Administrateur fait des données qu'il collecte, ni
  des conséquences d'une perte d'identifiants imputable à l'utilisateur. Le Service étant fourni gratuitement et
  son code diffusé sous licence libre, il est mis à disposition « en l'état », sans garantie autre que celles
  d'ordre public.
</p>

<h2>Article 13 : Données personnelles et cookies</h2>
<p>
  Les traitements de données personnelles sont décrits dans la
  <a href="/legal/confidentialite">politique de confidentialité</a> ; les traceurs déposés sont détaillés dans la
  <a href="/legal/cookies">page consacrée aux cookies</a>. Ces documents font partie intégrante des présentes CGU.
</p>

<h2>Article 14 : Propriété intellectuelle</h2>
<p>
  Le code source du Service est diffusé sous licence {LEGAL.source.license}. L'Administrateur conserve
  l'intégralité des droits sur les formulaires qu'il crée et sur les réponses qu'il collecte ; l'Éditeur ne
  s'octroie aucun droit d'exploitation sur ces contenus.
</p>

<h2>Article 15 : Suspension et résiliation</h2>
<p>
  En cas de manquement aux présentes CGU, l'Éditeur peut, après mise en demeure restée sans effet pendant   jours, ou sans délai en cas de manquement grave ou d'illicéité manifeste, suspendre l'accès au compte
  concerné ou dépublier le formulaire litigieux. Un compte inactif depuis plus de
  {retention.inactiveAccountMonths} mois peut être supprimé après information de son titulaire.
</p>

<h2>Article 16 : Modification des CGU</h2>
<p>
  Les présentes CGU peuvent être modifiées à tout moment. La version applicable est celle en ligne au moment de
  l'utilisation du Service ; les modifications substantielles sont portées à la connaissance des Administrateurs
  par courrier électronique.
</p>

<h2>Article 17 : Droit applicable et litiges</h2>
<p>
  Les présentes CGU sont soumises au droit français. En cas de différend, les parties rechercheront une solution
  amiable ; une réclamation peut être adressée à <a href="mailto:{publisher.email}">{publisher.email}</a>. À
  défaut d'accord, le litige sera porté devant les juridictions françaises compétentes.
</p>
