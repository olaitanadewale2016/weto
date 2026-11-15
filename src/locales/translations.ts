import { enDictionary, type Dictionary } from './en';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : string;
};

function mergeDictionary(base: Dictionary, overrides: DeepPartial<Dictionary>): Dictionary {
  const out: Record<string, unknown> = {};
  for (const section of Object.keys(base) as Array<keyof Dictionary>) {
    out[section] = {
      ...base[section],
      ...(overrides[section] || {}),
    };
  }
  return out as Dictionary;
}

export const frDictionary = mergeDictionary(enDictionary, {
  nav: {
    home: 'Accueil',
    explore: 'Explorer',
    notifications: 'Notifications',
    messenger: 'Messagerie',
    bookmarks: 'Favoris',
    marketplace: 'Marché',
    jobs: 'Emplois',
    wallet: 'Portefeuille',
    business: 'Entreprise',
    admin: 'Panneau Admin',
    profile: 'Profil',
    settings: 'Paramètres',
    newPost: 'Nouveau post',
    logout: 'Déconnexion',
  },
  auth: {
    loginTitle: 'Bon retour',
    loginSubtitle: 'Connectez-vous pour rejoindre votre communauté',
    signupTitle: 'Créer un compte',
    signupSubtitle: 'Rejoignez Weto et commencez à partager',
    forgotTitle: 'Réinitialiser le mot de passe',
    continueWithGoogle: 'Continuer avec Google',
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    signIn: 'Se connecter',
    signUp: 'Créer un compte',
    noAccount: 'Pas encore de compte ?',
    hasAccount: 'Vous avez déjà un compte ?',
  },
  feed: {
    whatsNew: 'Quoi de neuf ?',
    publish: 'Publier',
    saveDraft: 'Enregistrer le brouillon',
    sensitiveWarning: 'Contenu sensible',
    revealSensitive: 'Afficher le contenu',
    aiBadge: 'Généré par IA',
    translate: 'Traduire',
    translated: 'Traduit',
    comments: 'Commentaires',
    reply: 'Répondre',
    share: 'Partager',
    quote: 'Citer',
    bookmark: 'Enregistrer',
    bookmarked: 'Enregistré',
    pinProfile: 'Épingler sur le profil',
    report: 'Signaler',
    delete: 'Supprimer',
  },
  stories: { title: 'Stories', addStory: 'Ajouter', views: 'Vues' },
  messenger: { title: 'Messages', inbox: 'Boîte', requests: 'Demandes', archive: 'Archives', typeMessage: 'Écrire un message...', send: 'Envoyer', online: 'En ligne', typing: 'écrit...' },
  marketplace: { title: 'Marché', allCategories: 'Toutes les catégories', contactSeller: 'Contacter le vendeur', inStock: 'En stock', outOfStock: 'Rupture' },
  jobs: { title: 'Emplois', remoteOnly: 'Télétravail', urgentOnly: 'Urgent', applyNow: 'Postuler', applied: 'Envoyée' },
  wallet: { title: 'Portefeuille', balance: 'Solde disponible', deposit: 'Dépôt', transfer: 'Transfert', withdraw: 'Retrait', transactions: 'Transactions' },
});

export const esDictionary = mergeDictionary(enDictionary, {
  nav: {
    home: 'Inicio',
    explore: 'Explorar',
    notifications: 'Notificaciones',
    messenger: 'Mensajes',
    bookmarks: 'Guardados',
    marketplace: 'Mercado',
    jobs: 'Empleos',
    wallet: 'Billetera',
    business: 'Negocios',
    admin: 'Panel Admin',
    profile: 'Perfil',
    settings: 'Ajustes',
    newPost: 'Publicar',
    logout: 'Cerrar sesión',
  },
  auth: {
    loginTitle: 'Bienvenido de nuevo',
    signupTitle: 'Crea tu cuenta',
    continueWithGoogle: 'Continuar con Google',
    email: 'Correo electrónico',
    password: 'Contraseña',
    signIn: 'Iniciar sesión',
    signUp: 'Crear cuenta',
  },
  feed: {
    whatsNew: '¿Qué está pasando?',
    publish: 'Publicar',
    translate: 'Traducir',
    translated: 'Traducido',
    comments: 'Comentarios',
    reply: 'Responder',
    share: 'Compartir',
    bookmark: 'Guardar',
    report: 'Reportar',
    delete: 'Eliminar',
  },
  stories: { title: 'Historias', addStory: 'Añadir historia', views: 'Vistas' },
  messenger: { title: 'Mensajes', inbox: 'Bandeja', typeMessage: 'Escribe un mensaje...', send: 'Enviar', online: 'En línea', typing: 'escribiendo...' },
  marketplace: { title: 'Mercado', contactSeller: 'Contactar al vendedor' },
  jobs: { title: 'Empleos', remoteOnly: 'Solo remoto', applyNow: 'Postularme' },
  wallet: { title: 'Billetera', balance: 'Saldo disponible', deposit: 'Depositar', transfer: 'Transferir', withdraw: 'Retirar', transactions: 'Historial' },
});

export const deDictionary = mergeDictionary(enDictionary, {
  nav: {
    home: 'Startseite',
    explore: 'Entdecken',
    notifications: 'Mitteilungen',
    messenger: 'Nachrichten',
    bookmarks: 'Lesezeichen',
    marketplace: 'Marktplatz',
    jobs: 'Jobs',
    wallet: 'Wallet',
    business: 'Business',
    admin: 'Admin-Bereich',
    profile: 'Profil',
    settings: 'Einstellungen',
    newPost: 'Neuer Beitrag',
    logout: 'Abmelden',
  },
  feed: { whatsNew: 'Was gibt es Neues?', publish: 'Veröffentlichen', translate: 'Übersetzen', comments: 'Kommentare', reply: 'Antworten', share: 'Teilen' },
  wallet: { title: 'Wallet', balance: 'Verfügbares Guthaben', deposit: 'Einzahlen', transfer: 'Senden', withdraw: 'Auszahlen' },
});

export const ptDictionary = mergeDictionary(enDictionary, {
  nav: {
    home: 'Início',
    explore: 'Explorar',
    notifications: 'Notificações',
    messenger: 'Mensagens',
    bookmarks: 'Salvos',
    marketplace: 'Mercado',
    jobs: 'Vagas',
    wallet: 'Carteira',
    business: 'Negócios',
    admin: 'Painel Admin',
    profile: 'Perfil',
    settings: 'Configurações',
    newPost: 'Novo Post',
    logout: 'Sair',
  },
  feed: { whatsNew: 'O que está acontecendo?', publish: 'Publicar', translate: 'Traduzir', comments: 'Comentários', reply: 'Responder', share: 'Compartilhar' },
  wallet: { title: 'Carteira', balance: 'Saldo disponível', deposit: 'Depositar', transfer: 'Transferir', withdraw: 'Sacar' },
});

export const ruDictionary = mergeDictionary(enDictionary, {
  nav: {
    home: 'Главная',
    explore: 'Обзор',
    notifications: 'Уведомления',
    messenger: 'Сообщения',
    bookmarks: 'Закладки',
    marketplace: 'Маркет',
    jobs: 'Вакансии',
    wallet: 'Кошелёк',
    business: 'Бизнес',
    admin: 'Админ-панель',
    profile: 'Профиль',
    settings: 'Настройки',
    newPost: 'Создать пост',
    logout: 'Выйти',
  },
  feed: { whatsNew: 'Что нового?', publish: 'Опубликовать', translate: 'Перевести', comments: 'Комментарии', reply: 'Ответить', share: 'Поделиться' },
  wallet: { title: 'Кошелёк', balance: 'Доступный баланс', deposit: 'Пополнить', transfer: 'Перевести', withdraw: 'Вывести' },
});

export const arDictionary = mergeDictionary(enDictionary, {
  nav: {
    home: 'الرئيسية',
    explore: 'استكشاف',
    notifications: 'الإشعارات',
    messenger: 'الرسائل',
    bookmarks: 'المحفوظات',
    marketplace: 'المتجر',
    jobs: 'الوظائف',
    wallet: 'المحفظة',
    business: 'الأعمال',
    admin: 'لوحة التحكم',
    profile: 'الملف الشخصي',
    settings: 'الإعدادات',
    newPost: 'منشور جديد',
    logout: 'تسجيل الخروج',
  },
  auth: {
    loginTitle: 'مرحباً بعودتك',
    signupTitle: 'إنشاء حساب',
    continueWithGoogle: 'المتابعة عبر Google',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    signIn: 'تسجيل الدخول',
    signUp: 'إنشاء حساب',
  },
  feed: {
    whatsNew: 'ما الجديد؟',
    publish: 'نشر',
    saveDraft: 'حفظ كمسودة',
    translate: 'ترجمة',
    translated: 'مترجم',
    comments: 'التعليقات',
    reply: 'رد',
    share: 'مشاركة',
    bookmark: 'حفظ',
    report: 'إبلاغ',
    delete: 'حذف',
  },
  stories: { title: 'القصص', addStory: 'إضافة قصة', views: 'المشاهدات' },
  messenger: { title: 'الرسائل', inbox: 'الوارد', typeMessage: 'اكتب رسالة...', send: 'إرسال', online: 'متصل', typing: 'يكتب الآن...' },
  marketplace: { title: 'المتجر', contactSeller: 'تواصل مع البائع', inStock: 'متوفر', outOfStock: 'نفد' },
  jobs: { title: 'الوظائف', remoteOnly: 'عن بُعد فقط', applyNow: 'قدّم الآن' },
  wallet: { title: 'المحفظة', balance: 'الرصيد المتاح', deposit: 'إيداع', transfer: 'تحويل', withdraw: 'سحب', transactions: 'سجل المعاملات' },
});

export const LOCALE_DICTIONARIES: Record<string, Dictionary> = {
  en: enDictionary,
  fr: frDictionary,
  es: esDictionary,
  de: deDictionary,
  pt: ptDictionary,
  ru: ruDictionary,
  ar: arDictionary,
};
