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
    installedTitle: "App installed!",
    installedDescription: "You can now use Sajda directly from your home screen.",
    openApp: "Open app",
    title: "Install Sajda",
    description: "Get fast access to domain discovery directly from your home screen.",
    offline: "Works offline",
    offlineDescription: "Use the app without an internet connection.",
    nativeExperience: "Native experience",
    nativeExperienceDescription: "Feels like a real app.",
    iosInstructions: "How to install on iPhone or iPad:",
    iosStepOneBefore: "Tap the",
    iosStepOneAfter: "Share button",
    iosStepTwo: "Scroll and choose “Add to Home Screen”",
    iosStepThree: "Tap “Add”",
    installApp: "Install app",
    browserInstructions: "How to install:",
    browserStepOneBefore: "Tap the",
    browserStepOneAfter: "browser menu button",
    browserStepTwo: "Choose “Install app” or “Add to Home Screen”",
    continueInBrowser: "Continue in browser",
  },
  sv: {
    installedTitle: "Appen är installerad!",
    installedDescription: "Du kan nu använda Sajda direkt från din hemskärm.",
    openApp: "Öppna appen",
    title: "Installera Sajda",
    description: "Få snabb åtkomst till domänupptäckt direkt från din hemskärm.",
    offline: "Fungerar offline",
    offlineDescription: "Använd appen utan internetanslutning.",
    nativeExperience: "Native upplevelse",
    nativeExperienceDescription: "Känns som en riktig app.",
    iosInstructions: "Så här installerar du på iPhone eller iPad:",
    iosStepOneBefore: "Tryck på",
    iosStepOneAfter: "Dela-knappen",
    iosStepTwo: "Scrolla och välj “Lägg till på hemskärmen”",
    iosStepThree: "Tryck på “Lägg till”",
    installApp: "Installera appen",
    browserInstructions: "Så här installerar du:",
    browserStepOneBefore: "Tryck på",
    browserStepOneAfter: "menyknappen i webbläsaren",
    browserStepTwo: "Välj “Installera app” eller “Lägg till på hemskärmen”",
    continueInBrowser: "Fortsätt i webbläsaren",
  },
  es: {
    installedTitle: "¡Aplicación instalada!",
    installedDescription: "Ahora puedes usar Sajda directamente desde la pantalla de inicio.",
    openApp: "Abrir aplicación",
    title: "Instala Sajda",
    description: "Accede rápidamente al descubrimiento de dominios desde tu pantalla de inicio.",
    offline: "Funciona sin conexión",
    offlineDescription: "Usa la aplicación sin conexión a internet.",
    nativeExperience: "Experiencia de aplicación",
    nativeExperienceDescription: "Se siente como una aplicación nativa.",
    iosInstructions: "Cómo instalar en iPhone o iPad:",
    iosStepOneBefore: "Toca el botón",
    iosStepOneAfter: "Compartir",
    iosStepTwo: "Desplázate y elige «Añadir a pantalla de inicio»",
    iosStepThree: "Toca «Añadir»",
    installApp: "Instalar aplicación",
    browserInstructions: "Cómo instalar:",
    browserStepOneBefore: "Toca el botón de",
    browserStepOneAfter: "menú del navegador",
    browserStepTwo: "Elige «Instalar aplicación» o «Añadir a pantalla de inicio»",
    continueInBrowser: "Continuar en el navegador",
  },
  fr: {
    installedTitle: "Application installée !",
    installedDescription: "Vous pouvez désormais utiliser Sajda directement depuis votre écran d’accueil.",
    openApp: "Ouvrir l’application",
    title: "Installer Sajda",
    description: "Accédez rapidement à la découverte de domaines depuis votre écran d’accueil.",
    offline: "Fonctionne hors ligne",
    offlineDescription: "Utilisez l’application sans connexion internet.",
    nativeExperience: "Expérience d’application",
    nativeExperienceDescription: "Elle se comporte comme une application native.",
    iosInstructions: "Comment installer sur iPhone ou iPad :",
    iosStepOneBefore: "Touchez le bouton",
    iosStepOneAfter: "Partager",
    iosStepTwo: "Faites défiler puis choisissez « Sur l’écran d’accueil »",
    iosStepThree: "Touchez « Ajouter »",
    installApp: "Installer l’application",
    browserInstructions: "Comment installer :",
    browserStepOneBefore: "Touchez le bouton de",
    browserStepOneAfter: "menu du navigateur",
    browserStepTwo: "Choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil »",
    continueInBrowser: "Continuer dans le navigateur",
  },
  zh: {
    installedTitle: "应用已安装！",
    installedDescription: "现在可以直接从主屏幕使用 Sajda。",
    openApp: "打开应用",
    title: "安装 Sajda",
    description: "从主屏幕快速进入域名发现功能。",
    offline: "支持离线使用",
    offlineDescription: "没有网络连接时仍可使用应用。",
    nativeExperience: "原生应用体验",
    nativeExperienceDescription: "使用感受接近原生应用。",
    iosInstructions: "在 iPhone 或 iPad 上安装：",
    iosStepOneBefore: "点击",
    iosStepOneAfter: "分享按钮",
    iosStepTwo: "向下滚动并选择“添加到主屏幕”",
    iosStepThree: "点击“添加”",
    installApp: "安装应用",
    browserInstructions: "安装方法：",
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
