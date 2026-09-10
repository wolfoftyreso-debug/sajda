import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Smartphone, Check, Share, MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageProvider";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const installMessages = {
  en: {
    installedTitle: "Sajda is on your home screen",
    installedDescription: "You can now use Sajda directly from your home screen.",
    openApp: "Open Sajda",
    title: "Add Sajda to your home screen",
    description: "Add a shortcut to the web version of Sajda. This does not install an iPhone app from the App Store.",
    offline: "Internet required",
    offlineDescription: "Search, live domain checks, prices and account updates require an internet connection.",
    nativeExperience: "Web app shortcut",
    nativeExperienceDescription: "Open the website from your home screen in a dedicated browser window.",
    iosInstructions: "Add the shortcut on iPhone or iPad:",
    iosStepOneBefore: "Tap the",
    iosStepOneAfter: "Share button",
    iosStepTwo: "Scroll and choose “Add to Home Screen”",
    iosStepThree: "Tap “Add”",
    installApp: "Install web app",
    browserInstructions: "Add Sajda from your browser:",
    browserStepOneBefore: "Tap the",
    browserStepOneAfter: "browser menu button",
    browserStepTwo: "Choose “Install app” or “Add to Home Screen”",
    continueInBrowser: "Continue in browser",
  },
  sv: {
    installedTitle: "Sajda finns på hemskärmen",
    installedDescription: "Du kan nu använda Sajda direkt från din hemskärm.",
    openApp: "Öppna Sajda",
    title: "Lägg Sajda på hemskärmen",
    description: "Lägg till en genväg till webbversionen av Sajda. Det installerar inte en iPhone-app från App Store.",
    offline: "Internet krävs",
    offlineDescription: "Sökning, livekontroller, priser och kontouppdateringar kräver internetanslutning.",
    nativeExperience: "Genväg till webbappen",
    nativeExperienceDescription: "Öppna webbplatsen från hemskärmen i ett eget webbläsarfönster.",
    iosInstructions: "Lägg till genvägen på iPhone eller iPad:",
    iosStepOneBefore: "Tryck på",
    iosStepOneAfter: "Dela-knappen",
    iosStepTwo: "Bläddra och välj “Lägg till på hemskärmen”",
    iosStepThree: "Tryck på “Lägg till”",
    installApp: "Installera webbappen",
    browserInstructions: "Lägg till Sajda från webbläsaren:",
    browserStepOneBefore: "Tryck på",
    browserStepOneAfter: "menyknappen i webbläsaren",
    browserStepTwo: "Välj “Installera app” eller “Lägg till på hemskärmen”",
    continueInBrowser: "Fortsätt i webbläsaren",
  },
  es: {
    installedTitle: "Sajda está en tu pantalla de inicio",
    installedDescription: "Ahora puedes usar Sajda directamente desde la pantalla de inicio.",
    openApp: "Abrir Sajda",
    title: "Añade Sajda a tu pantalla de inicio",
    description: "Añade un acceso directo a la versión web de Sajda. No instala una aplicación de iPhone desde la App Store.",
    offline: "Requiere internet",
    offlineDescription: "Las búsquedas, las comprobaciones en tiempo real, los precios y las actualizaciones de tu cuenta requieren conexión a internet.",
    nativeExperience: "Acceso a la aplicación web",
    nativeExperienceDescription: "Abre el sitio desde la pantalla de inicio en una ventana del navegador.",
    iosInstructions: "Añade el acceso directo en iPhone o iPad:",
    iosStepOneBefore: "Toca el botón",
    iosStepOneAfter: "Compartir",
    iosStepTwo: "Desplázate y elige «Añadir a pantalla de inicio»",
    iosStepThree: "Toca «Añadir»",
    installApp: "Instalar aplicación web",
    browserInstructions: "Añade Sajda desde tu navegador:",
    browserStepOneBefore: "Toca el botón de",
    browserStepOneAfter: "menú del navegador",
    browserStepTwo: "Elige «Instalar aplicación» o «Añadir a pantalla de inicio»",
    continueInBrowser: "Continuar en el navegador",
  },
  fr: {
    installedTitle: "Sajda est sur votre écran d’accueil",
    installedDescription: "Vous pouvez désormais utiliser Sajda directement depuis votre écran d’accueil.",
    openApp: "Ouvrir Sajda",
    title: "Ajouter Sajda à l’écran d’accueil",
    description: "Ajoutez un raccourci vers la version web de Sajda. Cela n’installe pas une application iPhone depuis l’App Store.",
    offline: "Internet requis",
    offlineDescription: "Les recherches, les vérifications en temps réel, les prix et les mises à jour du compte nécessitent une connexion internet.",
    nativeExperience: "Raccourci vers le site",
    nativeExperienceDescription: "Ouvrez le site depuis l’écran d’accueil dans sa propre fenêtre de navigateur.",
    iosInstructions: "Ajouter le raccourci sur iPhone ou iPad :",
    iosStepOneBefore: "Touchez le bouton",
    iosStepOneAfter: "Partager",
    iosStepTwo: "Faites défiler puis choisissez « Sur l’écran d’accueil »",
    iosStepThree: "Touchez « Ajouter »",
    installApp: "Installer l’application web",
    browserInstructions: "Ajouter Sajda depuis votre navigateur :",
    browserStepOneBefore: "Touchez le bouton de",
    browserStepOneAfter: "menu du navigateur",
    browserStepTwo: "Choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil »",
    continueInBrowser: "Continuer dans le navigateur",
  },
  zh: {
    installedTitle: "Sajda 已添加到主屏幕",
    installedDescription: "现在可以直接从主屏幕使用 Sajda。",
    openApp: "打开 Sajda",
    title: "将 Sajda 添加到主屏幕",
    description: "添加 Sajda 网页版快捷方式。这不会从 App Store 安装 iPhone 应用。",
    offline: "需要网络连接",
    offlineDescription: "搜索、实时核验、价格和账户更新需要网络连接。",
    nativeExperience: "网页应用快捷方式",
    nativeExperienceDescription: "从主屏幕在独立的浏览器窗口中打开网站。",
    iosInstructions: "在 iPhone 或 iPad 上添加快捷方式：",
    iosStepOneBefore: "点击",
    iosStepOneAfter: "分享按钮",
    iosStepTwo: "向下滚动并选择“添加到主屏幕”",
    iosStepThree: "点击“添加”",
    installApp: "安装网页应用",
    browserInstructions: "通过浏览器添加 Sajda：",
    browserStepOneBefore: "点击浏览器的",
    browserStepOneAfter: "菜单按钮",
    browserStepTwo: "选择“安装应用”或“添加到主屏幕”",
    continueInBrowser: "继续使用浏览器",
  },
} as const;

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const navigate = useNavigate();
  const { language } = useLanguage();
  const copy = installMessages[language];

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
    }

    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>{copy.installedTitle}</CardTitle>
            <CardDescription>
              {copy.installedDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full">
              {copy.openApp}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl flex items-center justify-center mb-4 border border-primary/20">
            <Smartphone className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl">{copy.title}</CardTitle>
          <CardDescription>
            {copy.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Download className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{copy.offline}</p>
                <p className="text-xs text-muted-foreground">{copy.offlineDescription}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Smartphone className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{copy.nativeExperience}</p>
                <p className="text-xs text-muted-foreground">{copy.nativeExperienceDescription}</p>
              </div>
            </div>
          </div>

          {isIOS ? (
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium">{copy.iosInstructions}</p>
              <ol className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center">1</span>
                  <span>
                    {copy.iosStepOneBefore} <Share className="h-4 w-4 inline mx-1" aria-hidden="true" /> {copy.iosStepOneAfter}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center">2</span>
                  {copy.iosStepTwo}
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center">3</span>
                  {copy.iosStepThree}
                </li>
              </ol>
            </div>
          ) : deferredPrompt ? (
            <Button onClick={handleInstall} className="w-full" size="lg">
              <Download className="mr-2 h-5 w-5" />
              {copy.installApp}
            </Button>
          ) : (
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium">{copy.browserInstructions}</p>
              <ol className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center">1</span>
                  <span>
                    {copy.browserStepOneBefore} <MoreVertical className="h-4 w-4 inline mx-1" aria-hidden="true" /> {copy.browserStepOneAfter}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center">2</span>
                  {copy.browserStepTwo}
                </li>
              </ol>
            </div>
          )}

          <Button variant="ghost" onClick={() => navigate("/")} className="w-full">
            {copy.continueInBrowser}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Install;
