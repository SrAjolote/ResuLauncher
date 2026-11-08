"use strict";
const electron = require("electron");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const child_process = require("child_process");
const zlib = require("zlib");
const net = require("net");
const dns = require("dns");
const electronUpdater = require("electron-updater");
const CONFIG = {
  // Identidad
  brand: "Dbr",
  // Servidor de Minecraft (para el ping de estado)
  serverHost: "dragonblock.online",
  serverPort: 25625,
  // Versiones
  minecraft: "1.7.10",
  forge: "10.13.4.1614",
  // versión de Forge para 1.7.10
  // Hosting del modpack (repo DBR-ASSETS, servido por raw.githubusercontent).
  // Dos variantes del modpack que comparten Forge/MC: 'full' (por defecto) y 'lite'.
  // El manifest lite vive junto al full en la rama assets; sus jars van en la subcarpeta
  // lite/ (mismo `path` local, distinta url/sha1) → cambiar de variante re-sincroniza solo.
  manifestUrl: "https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/manifest.json",
  manifestUrlLite: "https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/manifest-lite.json",
  // Variante experimental (mods en pruebas, no apta para el servidor): mismo esquema que lite,
  // jars en la subcarpeta experimental/.
  manifestUrlExperimental: "https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/manifest-experimental.json",
  // Copia de cada archivo del modpack como asset de un release, con su sha1 por nombre. La sube
  // la Action de la rama assets. Se sirve desde objects.githubusercontent.com, otra red distinta
  // de raw: cuando raw bloquea la IP del jugador (403) la sync baja de aquí.
  assetMirrorBase: "https://github.com/jmpz2026/DbrLauncher/releases/download/assets-files/",
  // JSON de versión de Forge (overlay con inheritsFrom: "1.7.10").
  forgeJsonUrl: "https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/forge-1.7.10.json",
  // Autenticación premium (Microsoft OAuth · device code flow).
  // 1) Registrar una app en Azure Portal → Entra ID → App registrations (cuenta personal/consumers).
  // 2) Tipo "public client / native", habilitar "Allow public client flows" = Yes.
  // 3) Pegar el Application (client) ID aquí. Sin secreto (public client).
  auth: {
    // Apagado hasta que Mojang apruebe el client ID (aka.ms/mce-reviewappid); sin aprobación
    // login_with_xbox devuelve 403. Al aprobarlo, poner true y sacar release.
    premiumEnabled: false,
    azureClientId: "cea6378f-0390-4f9f-8f41-a4f512877fe5",
    scope: "XboxLive.signin offline_access",
    // Tenant 'consumers' = solo cuentas Microsoft personales (las de Minecraft/Xbox).
    deviceCodeUrl: "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode",
    tokenUrl: "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
  }
};
const isAzureConfigured = () => {
  const id = CONFIG.auth.azureClientId;
  return id.length > 0;
};
const isManifestConfigured = () => !CONFIG.manifestUrl.includes("OWNER/REPO");
const isForgeConfigured = () => !CONFIG.forgeJsonUrl.includes("OWNER/REPO");
const MC_LANG = { es: "es_ES", en: "en_US", pt: "pt_BR" };
function langDe(codigo) {
  const c = (codigo || "").toLowerCase();
  if (c.startsWith("es")) return "es";
  if (c.startsWith("pt")) return "pt";
  return "en";
}
const T = {
  // Comunes
  "comun.cargando": { es: "Cargando", en: "Loading", pt: "Carregando" },
  "comun.preparando": { es: "Preparando…", en: "Preparing…", pt: "Preparando…" },
  "comun.cerrar": { es: "Cerrar", en: "Close", pt: "Fechar" },
  "comun.copiar": { es: "Copiar", en: "Copy", pt: "Copiar" },
  "comun.copiado": { es: "Copiado", en: "Copied", pt: "Copiado" },
  "comun.cancelar": { es: "Cancelar", en: "Cancel", pt: "Cancelar" },
  "comun.instalando": { es: "Instalando…", en: "Installing…", pt: "Instalando…" },
  "comun.error": { es: "Error", en: "Error", pt: "Erro" },
  "comun.error_desconocido": { es: "Error desconocido", en: "Unknown error", pt: "Erro desconhecido" },
  // Barra de título y navegación
  "titulo.salir": { es: "Salir", en: "Log out", pt: "Sair" },
  "titulo.cerrar_sesion": { es: "Cerrar sesión", en: "Log out", pt: "Encerrar sessão" },
  "titulo.minimizar": { es: "Minimizar", en: "Minimize", pt: "Minimizar" },
  "titulo.idioma": { es: "Idioma del launcher y del juego", en: "Launcher and game language", pt: "Idioma do launcher e do jogo" },
  "nav.jugar": { es: "Jugar", en: "Play", pt: "Jogar" },
  "nav.ajustes": { es: "Ajustes", en: "Settings", pt: "Ajustes" },
  "nav.carpeta": { es: "Carpeta", en: "Folder", pt: "Pasta" },
  "nav.discord": { es: "Únete al Discord", en: "Join the Discord", pt: "Entre no Discord" },
  // Login
  "login.elige": { es: "Elige cómo entrar", en: "Choose how to log in", pt: "Escolha como entrar" },
  "login.titulo": { es: "Iniciar sesión", en: "Log in", pt: "Entrar" },
  "login.no_premium_desc": {
    es: "Sin cuenta de Mojang. Solo elige tu nombre en el servidor.",
    en: "No Mojang account needed. Just pick your name on the server.",
    pt: "Sem conta da Mojang. Só escolha seu nome no servidor."
  },
  "login.tu_nombre": { es: "Tu nombre", en: "Your name", pt: "Seu nome" },
  "login.entrar": { es: "Entrar", en: "Log in", pt: "Entrar" },
  "login.premium_desc": {
    es: "Cuenta oficial de Minecraft (Microsoft). Se abrirá tu navegador.",
    en: "Official Minecraft account (Microsoft). Your browser will open.",
    pt: "Conta oficial do Minecraft (Microsoft). Seu navegador vai abrir."
  },
  "login.premium_pronto_desc": {
    es: "Las cuentas oficiales de Minecraft (Microsoft) llegarán pronto. Por ahora entra con No-Premium.",
    en: "Official Minecraft accounts (Microsoft) are coming soon. For now log in with No-Premium.",
    pt: "As contas oficiais do Minecraft (Microsoft) chegam em breve. Por enquanto entre com No-Premium."
  },
  "login.pronto": { es: "Próximamente", en: "Coming soon", pt: "Em breve" },
  "login.conectando": { es: "Conectando…", en: "Connecting…", pt: "Conectando…" },
  "login.con_microsoft": { es: "Entrar con Microsoft", en: "Log in with Microsoft", pt: "Entrar com Microsoft" },
  "login.abre": { es: "Abre", en: "Open", pt: "Abra" },
  "login.introduce_codigo": {
    es: "e introduce este código:",
    en: "and enter this code:",
    pt: "e digite este código:"
  },
  "login.esperando": { es: "Esperando autorización", en: "Waiting for authorization", pt: "Aguardando autorização" },
  // Inicio
  "home.bienvenido": { es: "Bienvenido de vuelta", en: "Welcome back", pt: "Bem-vindo de volta" },
  "home.jugador": { es: "Jugador", en: "Player", pt: "Jogador" },
  "home.jugando": { es: "Jugando…", en: "Playing…", pt: "Jogando…" },
  "home.sincronizando": { es: "Sincronizando…", en: "Syncing…", pt: "Sincronizando…" },
  "home.jugar": { es: "Jugar", en: "Play", pt: "Jogar" },
  "home.experimental": {
    es: "Modpack experimental activo: no está diseñado para jugar en el servidor. Cámbialo en Ajustes para jugar normal.",
    en: "Experimental modpack active: it is not meant for playing on the server. Change it in Settings to play normally.",
    pt: "Modpack experimental ativo: não foi feito para jogar no servidor. Troque em Ajustes para jogar normalmente."
  },
  "home.crash": {
    es: "El juego se cerró con errores en el último arranque",
    en: "The game closed with errors the last time it ran",
    pt: "O jogo fechou com erros na última vez que abriu"
  },
  "home.ver_log": { es: "Ver log", en: "View log", pt: "Ver log" },
  "home.descartar": { es: "Descartar", en: "Dismiss", pt: "Descartar" },
  "home.en_marcha": { es: "Minecraft en marcha", en: "Minecraft is running", pt: "Minecraft em execução" },
  "home.mods_al_dia": { es: "Mods al día", en: "Mods up to date", pt: "Mods em dia" },
  "home.listo_version": {
    es: "Listo · v{version} — {updated} actualizados",
    en: "Ready · v{version} — {updated} updated",
    pt: "Pronto · v{version} — {updated} atualizados"
  },
  "home.eliminados": { es: ", {n} eliminados", en: ", {n} removed", pt: ", {n} removidos" },
  "home.servidor": { es: "Servidor…", en: "Server…", pt: "Servidor…" },
  "home.en_linea": { es: "{players}/{max} en línea", en: "{players}/{max} online", pt: "{players}/{max} online" },
  "home.servidor_offline": { es: "Servidor offline", en: "Server offline", pt: "Servidor offline" },
  // Progreso del lanzamiento
  "launch.version": { es: "Resolviendo versión", en: "Resolving version", pt: "Resolvendo versão" },
  "launch.libraries": { es: "Descargando librerías", en: "Downloading libraries", pt: "Baixando bibliotecas" },
  "launch.natives": { es: "Extrayendo natives", en: "Extracting natives", pt: "Extraindo natives" },
  "launch.assets": { es: "Descargando assets", en: "Downloading assets", pt: "Baixando assets" },
  "launch.client": { es: "Descargando cliente", en: "Downloading client", pt: "Baixando cliente" },
  "launch.java": { es: "Preparando Java", en: "Preparing Java", pt: "Preparando Java" },
  "launch.launching": { es: "Arrancando Minecraft", en: "Starting Minecraft", pt: "Iniciando Minecraft" },
  "launch.running": { es: "En marcha", en: "Running", pt: "Em execução" },
  // Progreso de la sincronización
  "sync.comprobando": { es: "Comprobando archivos…", en: "Checking files…", pt: "Verificando arquivos…" },
  "sync.descargando_archivo": {
    es: "Descargando {file}{others} — {done}/{total}",
    en: "Downloading {file}{others} — {done}/{total}",
    pt: "Baixando {file}{others} — {done}/{total}"
  },
  "sync.descargando": { es: "Descargando — {done}/{total}", en: "Downloading — {done}/{total}", pt: "Baixando — {done}/{total}" },
  "sync.limpiando": { es: "Limpiando {done}/{total}", en: "Cleaning up {done}/{total}", pt: "Limpando {done}/{total}" },
  "sync.listo": { es: "Listo", en: "Done", pt: "Pronto" },
  "sync.cancelar_hint": {
    es: "Si cancelas, la descarga sigue donde quedó la próxima vez.",
    en: "If you cancel, the download picks up where it left off next time.",
    pt: "Se cancelar, o download continua de onde parou na próxima vez."
  },
  // Ajustes
  "ajustes.titulo": { es: "Ajustes", en: "Settings", pt: "Ajustes" },
  "ajustes.idioma": { es: "Idioma", en: "Language", pt: "Idioma" },
  "ajustes.idioma_desc": {
    es: "Cambia el idioma del launcher y el del juego. El servidor te habla en el idioma de tu Minecraft.",
    en: "Changes the language of the launcher and of the game. The server talks to you in your Minecraft language.",
    pt: "Muda o idioma do launcher e do jogo. O servidor fala com você no idioma do seu Minecraft."
  },
  "ajustes.idioma_otro": {
    es: "Ahora el juego está en {juego} (elegido dentro de Minecraft); el launcher se muestra en inglés.",
    en: "The game is currently in {juego} (chosen inside Minecraft); the launcher is shown in English.",
    pt: "Agora o jogo está em {juego} (escolhido dentro do Minecraft); o launcher aparece em inglês."
  },
  "ajustes.ram": { es: "Memoria RAM", en: "RAM", pt: "Memória RAM" },
  "ajustes.ram_equipo": {
    es: "Tu equipo tiene {total} GB. Máximo asignable: {max} GB (se reservan 2 GB para el sistema).",
    en: "Your computer has {total} GB. Maximum you can assign: {max} GB (2 GB are kept for the system).",
    pt: "Seu computador tem {total} GB. Máximo que pode usar: {max} GB (2 GB ficam para o sistema)."
  },
  "ajustes.ram_generico": {
    es: "Asigna solo parte de tu RAM; deja memoria libre para el sistema.",
    en: "Assign only part of your RAM; leave some free for the system.",
    pt: "Use só parte da sua RAM; deixe memória livre para o sistema."
  },
  "ajustes.ram_maximo": {
    es: " Estás en el máximo recomendado para tu equipo.",
    en: " You are at the recommended maximum for your computer.",
    pt: " Você está no máximo recomendado para o seu computador."
  },
  "ajustes.creditos": { es: "Créditos y permisos", en: "Credits and permissions", pt: "Créditos e permissões" },
  "ajustes.credito_npcdbc": {
    es: "Gracias a KAMKEEL (Kam), autor del addon junto con bigguy345 (Goatee) y somehussar (Hussar), por permitirnos distribuir a los jugadores, a través de este launcher, nuestra versión modificada (un fork no oficial) con los créditos a sus autores. Concedido el 05/10/2026.",
    en: "Thanks to KAMKEEL (Kam), author of the addon together with bigguy345 (Goatee) and somehussar (Hussar), for allowing us to distribute to players, through this launcher, our modified version (an unofficial fork) with credit to its authors. Granted on 2026-10-05.",
    pt: "Obrigado a KAMKEEL (Kam), autor do addon junto com bigguy345 (Goatee) e somehussar (Hussar), por nos permitir distribuir aos jogadores, por meio deste launcher, a nossa versão modificada (um fork não oficial) com os créditos aos autores. Concedido em 05/10/2026."
  },
  "ajustes.credito_jingames": {
    es: "Gracias a Benjámin Nagy (Ben), de JinGames, autores de Dragon Block C, JRMCore, JBRA Client, Family C y Years C, por permitirnos crear y usar addons que extienden sus mods. Concedido el 06/10/2026. Sus mods se usan sin modificar.",
    en: "Thanks to Benjámin Nagy (Ben), of JinGames, authors of Dragon Block C, JRMCore, JBRA Client, Family C and Years C, for allowing us to create and use addons that extend their mods. Granted on 2026-10-06. Their mods are used unmodified.",
    pt: "Obrigado a Benjámin Nagy (Ben), da JinGames, autores de Dragon Block C, JRMCore, JBRA Client, Family C e Years C, por nos permitir criar e usar addons que estendem os mods deles. Concedido em 06/10/2026. Os mods deles são usados sem modificações."
  },
  "ajustes.proyecto_original": { es: "Proyecto original", en: "Original project", pt: "Projeto original" },
  "ajustes.nuestro_fork": { es: "Nuestro fork", en: "Our fork", pt: "Nosso fork" },
  "ajustes.independiente": {
    es: "Dragon Block Resurrection es un proyecto independiente: no está afiliado a JinGames ni a KAMKEEL.",
    en: "Dragon Block Resurrection is an independent project: it is not affiliated with JinGames or KAMKEEL.",
    pt: "Dragon Block Resurrection é um projeto independente: não tem vínculo com a JinGames nem com KAMKEEL."
  },
  "ajustes.diagnostico": { es: "Diagnóstico", en: "Diagnostics", pt: "Diagnóstico" },
  "ajustes.diagnostico_desc": {
    es: "Revisa el log del último arranque del juego si algo falló.",
    en: "Check the log of the last game launch if something went wrong.",
    pt: "Veja o log da última abertura do jogo se algo deu errado."
  },
  "ajustes.ver_ultimo_log": { es: "Ver último log", en: "View last log", pt: "Ver último log" },
  "ajustes.modpack": { es: "Versión del modpack", en: "Modpack version", pt: "Versão do modpack" },
  "ajustes.full": { es: "Completo", en: "Full", pt: "Completo" },
  "ajustes.full_desc": { es: "Todos los mods (recomendado)", en: "All mods (recommended)", pt: "Todos os mods (recomendado)" },
  "ajustes.lite": { es: "Lite", en: "Lite", pt: "Lite" },
  "ajustes.lite_desc": { es: "Menos mods, para equipos justos", en: "Fewer mods, for low-end computers", pt: "Menos mods, para computadores mais fracos" },
  "ajustes.experimental": { es: "Experimental", en: "Experimental", pt: "Experimental" },
  "ajustes.experimental_desc": {
    es: "Mods en pruebas, no para el servidor",
    en: "Mods being tested, not for the server",
    pt: "Mods em teste, não para o servidor"
  },
  "ajustes.modpack_nota": {
    es: "Al cambiar de versión, los mods se re-sincronizan la próxima vez que le des a Jugar.",
    en: "When you change version, the mods are synced again the next time you press Play.",
    pt: "Ao trocar de versão, os mods são sincronizados de novo na próxima vez que você clicar em Jogar."
  },
  "ajustes.cambiar_a": { es: "Cambiar a {variante}", en: "Switch to {variante}", pt: "Mudar para {variante}" },
  "ajustes.exp_aviso": {
    es: "Esta versión NO está diseñada para jugar en el servidor.",
    en: "This version is NOT meant for playing on the server.",
    pt: "Esta versão NÃO foi feita para jogar no servidor."
  },
  "ajustes.exp_detalle": {
    es: "Trae mods en pruebas para que los testees. Puede fallar, perder datos de tu configuración o no dejarte entrar al servidor. Para jugar normal, vuelve a Completo o Lite.",
    en: "It brings mods being tested so you can try them. It may fail, lose your settings or not let you join the server. To play normally, go back to Full or Lite.",
    pt: "Traz mods em teste para você testar. Pode falhar, perder dados da sua configuração ou não deixar você entrar no servidor. Para jogar normalmente, volte para Completo ou Lite."
  },
  "ajustes.exp_entiendo": {
    es: "Entiendo que no es para jugar en el servidor",
    en: "I understand it is not for playing on the server",
    pt: "Entendo que não é para jogar no servidor"
  },
  "ajustes.config_recomendada": {
    es: "¿Quieres aplicar también la configuración recomendada de esta versión (opciones gráficas y ajustes de mods)? Sobrescribe la configuración que tengas ahora.",
    en: "Do you also want to apply the recommended settings of this version (graphics options and mod settings)? It overwrites your current settings.",
    pt: "Quer aplicar também a configuração recomendada desta versão (opções gráficas e ajustes dos mods)? Ela substitui a configuração que você tem agora."
  },
  "ajustes.si_aplicar": { es: "Sí, aplicarla", en: "Yes, apply it", pt: "Sim, aplicar" },
  "ajustes.conservar": { es: "Conservar la mía", en: "Keep mine", pt: "Manter a minha" },
  "ajustes.autosync": { es: "Actualización automática de mods", en: "Automatic mod updates", pt: "Atualização automática dos mods" },
  "ajustes.autosync_on": {
    es: "Al dar Jugar se descargan e instalan los últimos mods del servidor.",
    en: "When you press Play, the latest server mods are downloaded and installed.",
    pt: "Ao clicar em Jogar, os mods mais recentes do servidor são baixados e instalados."
  },
  "ajustes.autosync_off": {
    es: "Desactivada: se juega con los mods ya instalados, sin descargar cambios.",
    en: "Off: you play with the mods already installed, without downloading changes.",
    pt: "Desativada: você joga com os mods já instalados, sem baixar mudanças."
  },
  "ajustes.activada": { es: "Activada", en: "On", pt: "Ativada" },
  "ajustes.desactivada": { es: "Desactivada", en: "Off", pt: "Desativada" },
  "ajustes.ventana": { es: "Ventana y JVM", en: "Window and JVM", pt: "Janela e JVM" },
  "ajustes.ancho": { es: "Ancho", en: "Width", pt: "Largura" },
  "ajustes.alto": { es: "Alto", en: "Height", pt: "Altura" },
  "ajustes.pantalla_completa": { es: "Pantalla completa", en: "Fullscreen", pt: "Tela cheia" },
  "ajustes.jvm": { es: "Argumentos JVM extra", en: "Extra JVM arguments", pt: "Argumentos extras da JVM" },
  "ajustes.java": { es: "Java 8 (runtime)", en: "Java 8 (runtime)", pt: "Java 8 (runtime)" },
  "ajustes.java_no_instalado": { es: "No instalado", en: "Not installed", pt: "Não instalado" },
  "ajustes.java_descargando": { es: "Descargando… {pct}%", en: "Downloading… {pct}%", pt: "Baixando… {pct}%" },
  "ajustes.java_extrayendo": { es: "Extrayendo…", en: "Extracting…", pt: "Extraindo…" },
  "ajustes.java_verificando": { es: "Verificando…", en: "Verifying…", pt: "Verificando…" },
  "ajustes.java_listo": {
    es: "Listo. Se usará para lanzar Minecraft 1.7.10.",
    en: "Ready. It will be used to launch Minecraft 1.7.10.",
    pt: "Pronto. Será usado para abrir o Minecraft 1.7.10."
  },
  "ajustes.java_auto": {
    es: "Se descargará automáticamente (Temurin/Adoptium) según tu sistema.",
    en: "It will be downloaded automatically (Temurin/Adoptium) for your system.",
    pt: "Será baixado automaticamente (Temurin/Adoptium) para o seu sistema."
  },
  "ajustes.java_reinstalar": { es: "Reinstalar", en: "Reinstall", pt: "Reinstalar" },
  "ajustes.java_descargar": { es: "Descargar Java 8", en: "Download Java 8", pt: "Baixar Java 8" },
  // Visor de log
  "log.titulo": { es: "Log del juego", en: "Game log", pt: "Log do jogo" },
  "log.vacio": { es: "No hay log del último arranque.", en: "There is no log from the last launch.", pt: "Não há log da última abertura." },
  "log.abrir_carpeta": { es: "Abrir carpeta", en: "Open folder", pt: "Abrir pasta" },
  // Propuesta de Lite
  "lite.titulo": { es: "Tu equipo parece justo", en: "Your computer seems low-end", pt: "Seu computador parece fraco" },
  "lite.texto": {
    es: "¿Pasar a la versión Lite? Usa ajustes gráficos más ligeros y activa el modo ligero del juego, así irá más fluido. Aplica su configuración recomendada (opciones gráficas y ajustes de mods). Puedes volver a Completo cuando quieras desde Ajustes.",
    en: "Switch to the Lite version? It uses lighter graphics settings and turns on the game's light mode, so it runs smoother. It applies its recommended settings (graphics options and mod settings). You can go back to Full whenever you want from Settings.",
    pt: "Mudar para a versão Lite? Ela usa ajustes gráficos mais leves e ativa o modo leve do jogo, assim fica mais fluido. Aplica a configuração recomendada dela (opções gráficas e ajustes dos mods). Você pode voltar para Completo quando quiser em Ajustes."
  },
  "lite.pasar": { es: "Pasar a Lite", en: "Switch to Lite", pt: "Mudar para Lite" },
  "lite.seguir": { es: "Seguir en Completo", en: "Stay on Full", pt: "Continuar no Completo" },
  "lite.motivo_juego": {
    es: "El juego activó su modo ligero en este equipo.",
    en: "The game turned on its light mode on this computer.",
    pt: "O jogo ativou o modo leve neste computador."
  },
  "lite.detectado": { es: "Detectado: {senales}.", en: "Detected: {senales}.", pt: "Detectado: {senales}." },
  "lite.ram": { es: "{gb} GB de RAM", en: "{gb} GB of RAM", pt: "{gb} GB de RAM" },
  "lite.nucleos": { es: "{n} núcleos", en: "{n} cores", pt: "{n} núcleos" },
  "lite.gpu_software": { es: "GPU por software", en: "software GPU", pt: "GPU por software" },
  "lite.gpu_antigua": { es: "GPU integrada antigua", en: "old integrated GPU", pt: "GPU integrada antiga" },
  // Actualización del launcher
  "update.descargando": { es: "Descargando actualización…", en: "Downloading update…", pt: "Baixando atualização…" },
  "update.reiniciando": { es: "Reiniciando…", en: "Restarting…", pt: "Reiniciando…" },
  "update.lista": { es: "Lista para instalar", en: "Ready to install", pt: "Pronta para instalar" },
  "update.titulo": { es: "Actualizando launcher", en: "Updating launcher", pt: "Atualizando launcher" },
  "update.reintentar": { es: "Reintentar", en: "Try again", pt: "Tentar de novo" },
  "update.ahora": { es: "Actualizar ahora", en: "Update now", pt: "Atualizar agora" },
  "update.fallo": {
    es: "No se pudo instalar. Vuelve a intentarlo e introduce tu contraseña.",
    en: "Could not install. Try again and enter your password.",
    pt: "Não foi possível instalar. Tente de novo e digite sua senha."
  },
  "update.password": {
    es: "Se pedirá la contraseña de tu usuario para instalar el paquete.",
    en: "Your user password will be asked to install the package.",
    pt: "A senha do seu usuário será pedida para instalar o pacote."
  },
  // libfuse2 (Linux)
  "fuse.titulo": { es: "Falta libfuse2", en: "libfuse2 is missing", pt: "Falta a libfuse2" },
  "fuse.texto": {
    es: "Tu sistema no tiene libfuse2. Sin ella el launcher puede no abrir con doble-click. Instálala para que funcione y se actualice bien.",
    en: "Your system does not have libfuse2. Without it the launcher may not open with a double-click. Install it so it works and updates properly.",
    pt: "Seu sistema não tem a libfuse2. Sem ela o launcher pode não abrir com clique duplo. Instale para que funcione e atualize direito."
  },
  "fuse.instalar": { es: "Instalar ahora", en: "Install now", pt: "Instalar agora" },
  "fuse.no_instalada": { es: "No se pudo instalar", en: "Could not install", pt: "Não foi possível instalar" },
  "fuse.solo_linux": { es: "Solo disponible en Linux", en: "Only available on Linux", pt: "Disponível só no Linux" },
  "fuse.distro": { es: "Distribución no reconocida", en: "Unrecognized distribution", pt: "Distribuição não reconhecida" },
  // Errores de main
  "err.nombre": {
    es: "El nombre debe tener 3-16 caracteres: letras, números o guion bajo.",
    en: "The name must have 3-16 characters: letters, numbers or underscore.",
    pt: "O nome deve ter de 3 a 16 caracteres: letras, números ou sublinhado."
  },
  "err.ms_iniciar": {
    es: "No se pudo iniciar el login de Microsoft: {detalle}",
    en: "Could not start the Microsoft login: {detalle}",
    pt: "Não foi possível iniciar o login da Microsoft: {detalle}"
  },
  "err.ms_cancelado": { es: "Autorización cancelada en Microsoft.", en: "Authorization cancelled on Microsoft.", pt: "Autorização cancelada na Microsoft." },
  "err.ms_expiro": { es: "El código expiró. Intenta de nuevo.", en: "The code expired. Try again.", pt: "O código expirou. Tente de novo." },
  "err.ms_error": { es: "Error de Microsoft: {detalle}", en: "Microsoft error: {detalle}", pt: "Erro da Microsoft: {detalle}" },
  "err.ms_sesion": {
    es: "La sesión de Microsoft expiró. Vuelve a iniciar sesión.",
    en: "The Microsoft session expired. Log in again.",
    pt: "A sessão da Microsoft expirou. Entre de novo."
  },
  "err.xbox": { es: "Fallo al autenticar con Xbox Live.", en: "Xbox Live authentication failed.", pt: "Falha ao autenticar no Xbox Live." },
  "err.xbox_sin_perfil": {
    es: "Esta cuenta Microsoft no tiene un perfil de Xbox. Crea uno en xbox.com.",
    en: "This Microsoft account has no Xbox profile. Create one at xbox.com.",
    pt: "Esta conta Microsoft não tem perfil do Xbox. Crie um em xbox.com."
  },
  "err.xbox_pais": {
    es: "Xbox Live no está disponible en tu país/región.",
    en: "Xbox Live is not available in your country/region.",
    pt: "O Xbox Live não está disponível no seu país/região."
  },
  "err.xbox_adulto": {
    es: "La cuenta requiere verificación de adulto (South Korea).",
    en: "The account requires adult verification (South Korea).",
    pt: "A conta exige verificação de adulto (South Korea)."
  },
  "err.xbox_menor": {
    es: "Cuenta de menor: debe añadirse a una Familia para usar Xbox Live.",
    en: "Child account: it must be added to a Family to use Xbox Live.",
    pt: "Conta de menor: precisa ser adicionada a uma Família para usar o Xbox Live."
  },
  "err.xsts": { es: "Fallo de autorización XSTS con Xbox Live.", en: "Xbox Live XSTS authorization failed.", pt: "Falha de autorização XSTS no Xbox Live." },
  "err.mc_login": {
    es: "Fallo al iniciar sesión en los servicios de Minecraft.",
    en: "Failed to log in to the Minecraft services.",
    pt: "Falha ao entrar nos serviços do Minecraft."
  },
  "err.mc_sin_juego": {
    es: "Esta cuenta Microsoft no posee Minecraft: Java Edition.",
    en: "This Microsoft account does not own Minecraft: Java Edition.",
    pt: "Esta conta Microsoft não tem o Minecraft: Java Edition."
  },
  "err.mc_perfil": {
    es: "No se pudo obtener el perfil de Minecraft.",
    en: "Could not get the Minecraft profile.",
    pt: "Não foi possível obter o perfil do Minecraft."
  },
  "err.sin_sesion": { es: "No hay sesión iniciada.", en: "You are not logged in.", pt: "Você não está logado." },
  "err.java_descarga": { es: "Descarga de Java falló ({status}).", en: "Java download failed ({status}).", pt: "O download do Java falhou ({status})." },
  "err.java_no_8": {
    es: "El runtime descargado no es Java 8: {detalle}",
    en: "The downloaded runtime is not Java 8: {detalle}",
    pt: "O runtime baixado não é Java 8: {detalle}"
  },
  "err.java_iniciar": { es: "No se pudo iniciar java: {detalle}", en: "Could not start java: {detalle}", pt: "Não foi possível iniciar o java: {detalle}" },
  "err.manifest": {
    es: "No se pudo descargar el manifest ({status}).",
    en: "Could not download the manifest ({status}).",
    pt: "Não foi possível baixar o manifest ({status})."
  },
  "err.descarga": { es: "Descarga falló ({status}): {url}", en: "Download failed ({status}): {url}", pt: "O download falhou ({status}): {url}" },
  "err.conectar": { es: "No se pudo conectar con {host}: {detalle}", en: "Could not connect to {host}: {detalle}", pt: "Não foi possível conectar a {host}: {detalle}" },
  "err.ping_timeout": { es: "Tiempo de espera agotado", en: "Timed out", pt: "Tempo esgotado" },
  "err.ping_invalido": { es: "Respuesta inválida del servidor", en: "Invalid response from the server", pt: "Resposta inválida do servidor" },
  // Pistas de errores de red (main/http.ts)
  "red.ERR_NAME_NOT_RESOLVED": {
    es: "el DNS no resolvió el dominio (tu proveedor de internet puede estar bloqueándolo; prueba con DNS 1.1.1.1)",
    en: "DNS did not resolve the domain (your internet provider may be blocking it; try DNS 1.1.1.1)",
    pt: "o DNS não resolveu o domínio (seu provedor de internet pode estar bloqueando; tente o DNS 1.1.1.1)"
  },
  "red.ERR_INTERNET_DISCONNECTED": { es: "no hay conexión a internet", en: "there is no internet connection", pt: "não há conexão com a internet" },
  "red.ERR_CONNECTION_TIMED_OUT": {
    es: "la conexión expiró (red lenta o firewall)",
    en: "the connection timed out (slow network or firewall)",
    pt: "a conexão expirou (rede lenta ou firewall)"
  },
  "red.ERR_CONNECTION_REFUSED": { es: "el servidor rechazó la conexión", en: "the server refused the connection", pt: "o servidor recusou a conexão" },
  "red.ERR_CONNECTION_RESET": {
    es: "la conexión se cortó a mitad (firewall o antivirus)",
    en: "the connection was cut halfway (firewall or antivirus)",
    pt: "a conexão caiu no meio (firewall ou antivírus)"
  },
  "red.ERR_CERT_AUTHORITY_INVALID": {
    es: "certificado no confiable: desactiva el escaneo HTTPS/SSL de tu antivirus o añade su certificado al sistema",
    en: "untrusted certificate: turn off the HTTPS/SSL scanning of your antivirus or add its certificate to the system",
    pt: "certificado não confiável: desative a verificação HTTPS/SSL do seu antivírus ou adicione o certificado dele ao sistema"
  },
  "red.ERR_CERT_COMMON_NAME_INVALID": {
    es: "el certificado no corresponde al dominio (algo está interceptando la conexión)",
    en: "the certificate does not match the domain (something is intercepting the connection)",
    pt: "o certificado não corresponde ao domínio (algo está interceptando a conexão)"
  },
  "red.ERR_CERT_DATE_INVALID": {
    es: "certificado fuera de fecha: revisa la fecha y hora de tu PC",
    en: "certificate out of date: check the date and time of your PC",
    pt: "certificado fora da validade: confira a data e a hora do seu PC"
  },
  "red.ERR_SSL_PROTOCOL_ERROR": {
    es: "fallo de TLS (antivirus, proxy o Windows sin actualizar)",
    en: "TLS failure (antivirus, proxy or outdated Windows)",
    pt: "falha de TLS (antivírus, proxy ou Windows desatualizado)"
  },
  "red.ERR_PROXY_CONNECTION_FAILED": {
    es: "el proxy configurado en Windows no responde",
    en: "the proxy configured in Windows does not respond",
    pt: "o proxy configurado no Windows não responde"
  },
  "red.sin_respuesta": { es: "{s}s sin respuesta", en: "no response for {s}s", pt: "{s}s sem resposta" }
};
function existe(clave) {
  return Object.prototype.hasOwnProperty.call(T, clave);
}
function t(lang, clave, vars) {
  const texto = T[clave][lang];
  if (!vars) return texto;
  return texto.replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m);
}
const DEFAULT_JVM_ARGS = "-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=25 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=40 -XX:G1HeapRegionSize=8M -XX:+ParallelRefProcEnabled -XX:+AlwaysPreTouch -Dfml.ignoreInvalidMinecraftCertificates=true -Dfml.ignorePatchDiscrepancies=true";
const OLD_DEFAULT_JVM_ARGS_32M = "-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M";
const DEFAULT_SETTINGS = {
  ramGb: 4,
  width: 854,
  height: 480,
  fullscreen: false,
  jvmArgs: DEFAULT_JVM_ARGS,
  jvmArgsMigrated: false,
  modpackVariant: "full",
  autoSyncMods: true,
  modpackSeedPending: false,
  modpackSyncPending: false,
  liteProposal: "none",
  idioma: null
};
const MIN_RAM_GB = 2;
const RAM_HEADROOM_GB = 2;
const filePath$1 = () => path.join(electron.app.getPath("userData"), "settings.json");
let cache$1 = null;
function totalRamGb() {
  return Math.floor(os.totalmem() / 1024 ** 3);
}
function maxRamGb() {
  return Math.min(16, Math.max(MIN_RAM_GB, totalRamGb() - RAM_HEADROOM_GB));
}
function ramLimits() {
  return { totalGb: totalRamGb(), maxGb: maxRamGb() };
}
function loadSettings() {
  if (cache$1) return cache$1;
  try {
    cache$1 = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(filePath$1(), "utf-8")) };
  } catch {
    cache$1 = { ...DEFAULT_SETTINGS };
  }
  if (!cache$1.jvmArgsMigrated) {
    if (!cache$1.jvmArgs.trim()) cache$1.jvmArgs = DEFAULT_JVM_ARGS;
    cache$1.jvmArgsMigrated = true;
    try {
      fs.writeFileSync(filePath$1(), JSON.stringify(cache$1), "utf-8");
    } catch {
    }
  }
  if (cache$1.jvmArgs.trim() === OLD_DEFAULT_JVM_ARGS_32M) {
    cache$1.jvmArgs = DEFAULT_JVM_ARGS;
    try {
      fs.writeFileSync(filePath$1(), JSON.stringify(cache$1), "utf-8");
    } catch {
    }
  }
  cache$1.ramGb = Math.min(Math.max(cache$1.ramGb, MIN_RAM_GB), maxRamGb());
  return cache$1;
}
function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  cache$1 = next;
  fs.writeFileSync(filePath$1(), JSON.stringify(next), "utf-8");
  return next;
}
function registerSettings() {
  electron.ipcMain.handle("settings:get", () => loadSettings());
  electron.ipcMain.handle("settings:limits", () => ramLimits());
  electron.ipcMain.handle(
    "settings:set",
    (_e, patch) => saveSettings(markVariantChange(clampPatch(patch)))
  );
}
function markVariantChange(patch) {
  if (!patch.modpackVariant || patch.modpackVariant === loadSettings().modpackVariant) return patch;
  return { ...patch, modpackSyncPending: true };
}
function clampPatch(patch) {
  if (typeof patch.ramGb !== "number") return patch;
  return { ...patch, ramGb: Math.min(Math.max(patch.ramGb, MIN_RAM_GB), maxRamGb()) };
}
function leerLang(texto) {
  const m = /^lang:(.+)$/m.exec(texto);
  return m ? m[1].trim() : null;
}
function fijarLang(texto, lang) {
  if (/^lang:.*$/m.test(texto)) return texto.replace(/^lang:.*$/m, "lang:" + lang);
  return texto + (texto.endsWith("\n") || texto === "" ? "" : "\n") + "lang:" + lang + "\n";
}
function langActual(ruta) {
  try {
    return fs.existsSync(ruta) ? leerLang(fs.readFileSync(ruta, "utf-8")) : null;
  } catch {
    return null;
  }
}
function escribirLang(ruta, lang) {
  try {
    if (!fs.existsSync(ruta)) return false;
    const texto = fs.readFileSync(ruta, "utf-8");
    if (leerLang(texto) !== lang) fs.writeFileSync(ruta, fijarLang(texto, lang), "utf-8");
    return true;
  } catch {
    return false;
  }
}
function aplicarLang(ruta, previo, inicial) {
  escribirLang(ruta, previo ?? inicial);
}
const getGameDir = () => path.join(electron.app.getPath("userData"), "game");
const getManagedFile = () => path.join(electron.app.getPath("userData"), "managed.json");
const opciones = () => path.join(getGameDir(), "options.txt");
function langInicial() {
  return loadSettings().idioma ?? MC_LANG[langDe(electron.app.getLocale())];
}
function idiomaInfo() {
  const juego = langActual(opciones());
  return { lang: langDe(juego ?? langInicial()), juego };
}
function tr(clave, vars) {
  return t(idiomaInfo().lang, clave, vars);
}
function fijarIdioma(lang) {
  const mc = MC_LANG[lang];
  saveSettings({ idioma: mc });
  escribirLang(opciones(), mc);
  return idiomaInfo();
}
function registerIdioma() {
  electron.ipcMain.handle("idioma:get", () => idiomaInfo());
  electron.ipcMain.handle(
    "idioma:set",
    (_e, lang) => fijarIdioma(lang === "es" || lang === "pt" ? lang : "en")
  );
}
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
function offlineUuid(username) {
  const hash = crypto.createHash("md5").update(`OfflinePlayer:${username}`).digest();
  hash[6] = hash[6] & 15 | 48;
  hash[8] = hash[8] & 63 | 128;
  const hex = hash.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function makePirataAccount(rawName) {
  const username = rawName.trim();
  if (!NAME_RE.test(username)) {
    throw new Error(tr("err.nombre"));
  }
  return { type: "pirata", username, uuid: offlineUuid(username) };
}
function abortError() {
  const e = new Error("Cancelado");
  e.name = "AbortError";
  return e;
}
const isAbortError = (e) => e instanceof Error && e.name === "AbortError";
const IDLE_TIMEOUT_MS = 2e4;
const ALIAS = { ERR_TIMED_OUT: "ERR_CONNECTION_TIMED_OUT" };
function hintOf(code) {
  const clave = "red." + (ALIAS[code] ?? code);
  return existe(clave) ? tr(clave) : void 0;
}
function describe(url, err) {
  const code = /ERR_[A-Z_]+/.exec(err.message)?.[0];
  const hint = code ? hintOf(code) : void 0;
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();
  const detail = hint ? `${hint} [${code}]` : err.message;
  return new Error(tr("err.conectar", { host, detalle: detail }), { cause: err });
}
function toBuffer(body) {
  if (body == null) return null;
  if (Buffer.isBuffer(body)) return body;
  return Buffer.from(typeof body === "string" ? body : body.toString(), "utf-8");
}
function requestOnce(url, init = {}) {
  const { method = "GET", headers = {}, onProgress } = init;
  const payload = toBuffer(init.body);
  const hasType = Object.keys(headers).some((h) => h.toLowerCase() === "content-type");
  return new Promise((resolve, reject) => {
    if (init.signal?.aborted) return reject(abortError());
    const req = electron.net.request({ method, url, redirect: "follow" });
    const idleMs = init.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
    let settled = false;
    let timer;
    let fd = null;
    const closeFile = () => {
      if (fd !== null) fs.closeSync(fd);
      fd = null;
    };
    const onAbort = () => {
      finish(() => reject(abortError()));
      req.abort();
    };
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeFile();
      init.signal?.removeEventListener("abort", onAbort);
      fn();
    };
    init.signal?.addEventListener("abort", onAbort, { once: true });
    const offset = init.toFile && fs.existsSync(init.toFile) ? fs.statSync(init.toFile).size : 0;
    if (offset > 0) req.setHeader("Range", `bytes=${offset}-`);
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        finish(() => reject(describe(url, new Error(`net::ERR_TIMED_OUT (${tr("red.sin_respuesta", { s: idleMs / 1e3 })})`))));
        req.abort();
      }, idleMs);
    };
    arm();
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v);
    if (payload && !hasType && init.body instanceof URLSearchParams) {
      req.setHeader("Content-Type", "application/x-www-form-urlencoded");
    }
    req.on("response", (res) => {
      const length = Number(res.headers["content-length"] ?? 0);
      const chunks = [];
      let received = 0;
      let base = 0;
      if (init.toFile && (res.statusCode === 200 || res.statusCode === 206)) {
        base = res.statusCode === 206 ? offset : 0;
        fd = fs.openSync(init.toFile, res.statusCode === 206 ? "a" : "w");
      } else if (init.toFile && res.statusCode === 416) {
        fs.rmSync(init.toFile, { force: true });
      }
      const total = length > 0 ? base + length : 0;
      arm();
      res.on("data", (chunk) => {
        if (settled) return;
        arm();
        if (fd !== null) {
          try {
            fs.writeSync(fd, chunk);
          } catch (e) {
            finish(() => reject(e));
            req.abort();
            return;
          }
        } else chunks.push(chunk);
        received += chunk.length;
        onProgress?.(base + received, total);
      });
      res.on("end", () => {
        if (fd !== null && length > 0 && received !== length) {
          finish(() => reject(describe(url, new Error("net::ERR_CONTENT_LENGTH_MISMATCH"))));
          return;
        }
        const norm = {};
        for (const [k, v] of Object.entries(res.headers)) {
          norm[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
        }
        const status = res.statusCode;
        finish(
          () => resolve({ status, ok: status >= 200 && status < 300, headers: norm, body: Buffer.concat(chunks) })
        );
      });
      res.on("error", (e) => finish(() => reject(describe(url, e))));
    });
    req.on("error", (e) => finish(() => reject(describe(url, e))));
    if (payload) req.write(payload);
    req.end();
  });
}
const RETRY_STATUS = /* @__PURE__ */ new Set([408, 416, 425, 429, 500, 502, 503, 504]);
const RETRIES = 3;
const BACKOFF_MS = 1e3;
const MAX_RETRY_AFTER_MS = 1e4;
const MIRROR_STATUS = /* @__PURE__ */ new Set([403]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => Math.round(ms * (0.5 + Math.random()));
function retryAfterMs(res) {
  const raw = res.headers["retry-after"];
  if (!raw) return null;
  const secs = Number(raw);
  const ms = Number.isFinite(secs) ? secs * 1e3 : Date.parse(raw) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(ms, MAX_RETRY_AFTER_MS);
}
function mirrorsFor(url) {
  const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(url);
  if (!m) return [];
  const [, owner, repo, ref, path2] = m;
  return [
    `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${path2}`,
    `https://cdn.statically.io/gh/${owner}/${repo}/${ref}/${path2}`
  ];
}
async function httpRequest(url, init = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const idempotent = method === "GET" || method === "HEAD";
  const targets = idempotent ? [url, ...init.mirrors ?? [], ...mirrorsFor(url)] : [url];
  const attempts = idempotent ? RETRIES + 1 : 1;
  let lastRes;
  let lastErr;
  for (const [i, target] of targets.entries()) {
    const isMirror = i > 0;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const backoff = jitter(BACKOFF_MS * 2 ** (attempt - 1));
      if (init.signal?.aborted) throw abortError();
      try {
        const res = await requestOnce(target, init);
        const toMirror = !isMirror && targets.length > 1 && MIRROR_STATUS.has(res.status);
        if (res.ok || !isMirror && !toMirror && !RETRY_STATUS.has(res.status)) return res;
        if (!isMirror || !lastRes) lastRes = res;
        if (toMirror) break;
        if (attempt < attempts && RETRY_STATUS.has(res.status)) {
          await sleep(retryAfterMs(res) ?? backoff);
        } else if (attempt < attempts) {
          break;
        }
      } catch (e) {
        if (isAbortError(e)) throw e;
        lastErr = e;
        if (attempt < attempts) await sleep(backoff);
      }
    }
  }
  if (lastRes) return lastRes;
  throw lastErr;
}
function readJson(res, url) {
  try {
    return JSON.parse(res.body.toString("utf-8"));
  } catch {
    throw new Error(`Respuesta no válida (no es JSON) de ${url} [HTTP ${res.status}]`);
  }
}
function readJsonOr(res, fallback) {
  try {
    return JSON.parse(res.body.toString("utf-8"));
  } catch {
    return fallback;
  }
}
const { azureClientId, scope, tokenUrl } = CONFIG.auth;
async function refreshToken(refresh) {
  const res = await httpRequest(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: azureClientId,
      refresh_token: refresh,
      scope
    })
  });
  const data = readJsonOr(res, {});
  if (!res.ok) throw new Error(tr("err.ms_sesion"));
  return {
    accessToken: String(data.access_token),
    refreshToken: String(data.refresh_token ?? refresh)
  };
}
async function xblAuthenticate(msAccessToken) {
  const res = await httpRequest("https://user.auth.xboxlive.com/user/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: `d=${msAccessToken}`
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT"
    })
  });
  if (!res.ok) throw new Error(tr("err.xbox"));
  const data = readJson(res, "user.auth.xboxlive.com");
  return { token: data.Token, uhs: data.DisplayClaims.xui[0].uhs };
}
async function xstsAuthorize(xblToken) {
  const res = await httpRequest("https://xsts.auth.xboxlive.com/xsts/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      Properties: { SandboxId: "RETAIL", UserTokens: [xblToken] },
      RelyingParty: "rp://api.minecraftservices.com/",
      TokenType: "JWT"
    })
  });
  if (res.status === 401) {
    const err = readJsonOr(res, {});
    switch (String(err.XErr)) {
      case "2148916233":
        throw new Error(tr("err.xbox_sin_perfil"));
      case "2148916235":
        throw new Error(tr("err.xbox_pais"));
      case "2148916236":
      case "2148916237":
        throw new Error(tr("err.xbox_adulto"));
      case "2148916238":
        throw new Error(tr("err.xbox_menor"));
      default:
        throw new Error(tr("err.xsts"));
    }
  }
  if (!res.ok) throw new Error(tr("err.xsts"));
  const data = readJson(res, "xsts.auth.xboxlive.com");
  return { token: data.Token, uhs: data.DisplayClaims.xui[0].uhs };
}
async function loginWithXbox(uhs, xstsToken) {
  const res = await httpRequest("https://api.minecraftservices.com/authentication/login_with_xbox", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xstsToken}` })
  });
  if (!res.ok) throw new Error(tr("err.mc_login"));
  const data = readJson(res, "api.minecraftservices.com/authentication");
  return data.access_token;
}
async function getProfile(mcAccessToken) {
  const res = await httpRequest("https://api.minecraftservices.com/minecraft/profile", {
    headers: { Authorization: `Bearer ${mcAccessToken}` }
  });
  if (res.status === 404) {
    throw new Error(tr("err.mc_sin_juego"));
  }
  if (!res.ok) throw new Error(tr("err.mc_perfil"));
  const data = readJson(res, "api.minecraftservices.com/minecraft/profile");
  const raw = String(data.id);
  const uuid = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  return { uuid, name: String(data.name) };
}
async function fetchMinecraftProfile(msAccessToken) {
  const xbl = await xblAuthenticate(msAccessToken);
  const xsts = await xstsAuthorize(xbl.token);
  const mcToken = await loginWithXbox(xsts.uhs, xsts.token);
  const profile = await getProfile(mcToken);
  return { ...profile, accessToken: mcToken };
}
const filePath = () => path.join(electron.app.getPath("userData"), "account.json");
function read$1() {
  try {
    const p = filePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}
function loadAccount() {
  const p = read$1();
  if (!p) return null;
  return { type: p.type, username: p.username, uuid: p.uuid };
}
function loadRefreshToken() {
  const p = read$1();
  if (!p?.refreshTokenEnc) return null;
  try {
    if (!electron.safeStorage.isEncryptionAvailable()) return null;
    return electron.safeStorage.decryptString(Buffer.from(p.refreshTokenEnc, "base64"));
  } catch {
    return null;
  }
}
function saveAccount(account, refreshToken2) {
  const data = {
    type: account.type,
    username: account.username,
    uuid: account.uuid
  };
  if (refreshToken2 && electron.safeStorage.isEncryptionAvailable()) {
    data.refreshTokenEnc = electron.safeStorage.encryptString(refreshToken2).toString("base64");
  }
  fs.writeFileSync(filePath(), JSON.stringify(data), "utf-8");
}
function clearAccount() {
  try {
    const p = filePath();
    if (fs.existsSync(p)) fs.rmSync(p);
  } catch {
  }
}
function errMsg(err) {
  const parts = [];
  let cur = err;
  for (let depth = 0; cur != null && depth < 4; depth++) {
    const e = cur;
    const msg = typeof e.message === "string" ? e.message : String(cur);
    const code = typeof e.code === "string" ? e.code : "";
    const line = code && !msg.includes(code) ? `${msg} [${code}]` : msg;
    if (line && !parts.includes(line)) parts.push(line);
    cur = e.cause;
  }
  return parts.join(" · ") || tr("comun.error_desconocido");
}
let currentMcToken = null;

async function loginPremium(sender) {
  // Microsoft Public Native Client ID (estándar para Minecraft Launcher)
  const clientId = "00000000402b5328";
  const scope = "service::user.auth.xboxlive.com::MBI_SSL";

  // 1. Iniciar Device Code Flow
  const devRes = await httpRequest("https://login.live.com/oauth20_connect.srf", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      response_type: "device_code",
      scope: scope
    })
  });

  const devData = readJson(devRes, "login.live.com device_code");
  if (!devData.device_code) {
    // Si falla, intentamos con Microsoft v2 OAuth
    const devRes2 = await httpRequest("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "00000000402b5328",
        scope: "XboxLive.signin offline_access"
      })
    });
    const d2 = readJson(devRes2, "microsoft device code");
    devData.device_code = d2.device_code;
    devData.user_code = d2.user_code;
    devData.verification_uri = d2.verification_uri || "https://microsoft.com/link";
    devData.interval = d2.interval || 5;
    devData.expires_in = d2.expires_in || 900;
  }

  // Notificar al sender / abrir navegador del usuario automáticamente
  if (devData.verification_uri) {
    electron.shell.openExternal(devData.verification_uri);
  }
  sender.send("auth:device-code", {
    userCode: devData.user_code,
    verificationUri: devData.verification_uri || "https://microsoft.com/link"
  });

  // 2. Sondear hasta que el usuario autorice
  const interval = (devData.interval || 5) * 1000;
  const deadline = Date.now() + ((devData.expires_in || 900) * 1000);
  let msToken = null;
  let refreshTokenVal = null;

  while (Date.now() < deadline) {
    await sleep(interval);
    const tokenRes = await httpRequest("https://login.live.com/oauth20_token.srf", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: devData.device_code
      })
    });

    const tokenData = readJsonOr(tokenRes, {});
    if (tokenData.access_token) {
      msToken = tokenData.access_token;
      refreshTokenVal = tokenData.refresh_token;
      break;
    }
    if (tokenData.error && tokenData.error !== "authorization_pending") {
      throw new Error("Autorización fallida: " + (tokenData.error_description || tokenData.error));
    }
  }

  if (!msToken) {
    throw new Error("Tiempo de espera para autorizar en Microsoft expirado.");
  }

  // 3. Autenticación con Xbox Live y Minecraft
  const profile = await fetchMinecraftProfile(msToken);
  currentMcToken = profile.accessToken;
  const account = {
    type: "premium",
    username: profile.name,
    uuid: profile.uuid
  };
  saveAccount(account, refreshTokenVal);
  return account;
}

function registerAuth() {
  electron.ipcMain.handle("auth:get", () => loadAccount());
  electron.ipcMain.handle("auth:login-pirata", (_e, username) => {
    try {
      const account = makePirataAccount(username);
      saveAccount(account);
      currentMcToken = null;
      return { ok: true, account };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });
  electron.ipcMain.handle("auth:login-premium", async (e) => {
    try {
      const account = await loginPremium(e.sender);
      return { ok: true, account };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });
  electron.ipcMain.handle("auth:logout", () => {
    clearAccount();
    currentMcToken = null;
  });
}
async function ensureMcToken() {
  if (currentMcToken) return currentMcToken;
  const account = loadAccount();
  if (account?.type !== "premium") return null;
  const refresh = loadRefreshToken();
  if (!refresh) return null;
  try {
    const ms = await refreshToken(refresh);
    const profile = await fetchMinecraftProfile(ms.accessToken);
    currentMcToken = profile.accessToken;
    saveAccount(account, ms.refreshToken);
    return currentMcToken;
  } catch {
    return null;
  }
}
function sha1File(filePath2) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    fs.createReadStream(filePath2).on("data", (chunk) => hash.update(chunk)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
  });
}
let cache = null;
let dirty = false;
const cacheFile = () => path.join(electron.app.getPath("userData"), "hash-cache.json");
function load() {
  if (cache) return cache;
  cache = /* @__PURE__ */ new Map();
  try {
    if (fs.existsSync(cacheFile())) {
      const raw = JSON.parse(fs.readFileSync(cacheFile(), "utf-8"));
      for (const [k, v] of Object.entries(raw)) cache.set(k, v);
    }
  } catch {
  }
  return cache;
}
async function sha1FileCached(filePath2) {
  const st = fs.statSync(filePath2);
  const map = load();
  const hit = map.get(filePath2);
  if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.sha1;
  const sha1 = (await sha1File(filePath2)).toLowerCase();
  map.set(filePath2, { size: st.size, mtimeMs: st.mtimeMs, sha1 });
  dirty = true;
  return sha1;
}
function rememberSha1(filePath2, sha1) {
  const st = fs.statSync(filePath2);
  load().set(filePath2, { size: st.size, mtimeMs: st.mtimeMs, sha1: sha1.toLowerCase() });
  dirty = true;
}
function flushHashCache() {
  if (!dirty || !cache) return;
  try {
    const out = {};
    for (const [k, v] of cache) if (fs.existsSync(k)) out[k] = v;
    fs.writeFileSync(cacheFile(), JSON.stringify(out));
    dirty = false;
  } catch {
  }
}
const RAW = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//;
async function headSha(owner, repo, branch) {
  try {
    const res = await httpRequest(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`, {
      headers: { Accept: "application/vnd.github.sha" }
    });
    const sha = res.ok ? res.body.toString("utf-8").trim() : "";
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}
async function fetchManifest(url) {
  const m = RAW.exec(url);
  const sha = m ? await headSha(m[1], m[2], m[3]) : null;
  const branchBase = m ? m[0] : "";
  const pinnedBase = m && sha ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${sha}/` : "";
  const pin = (u) => pinnedBase && u.startsWith(branchBase) ? pinnedBase + u.slice(branchBase.length) : u;
  const res = await httpRequest(pin(url));
  if (!res.ok) throw new Error(tr("err.manifest", { status: res.status }));
  const data = readJson(res, url);
  if (!data || !Array.isArray(data.files)) {
    throw new Error('Manifest inválido: falta la lista "files".');
  }
  if (pinnedBase) {
    for (const f of data.files) f.url = pin(f.url);
  }
  return data;
}
const RESUMABLE_MIN_SIZE = 1024 * 1024;
const partFor = (dest, sha1) => `${dest}.${sha1.slice(0, 8).toLowerCase()}.part`;
async function ensureFile(dest, url, sha1, onProgress, mirrors, opts = {}) {
  if (fs.existsSync(dest)) {
    if (!sha1) return false;
    if (await sha1FileCached(dest) === sha1.toLowerCase()) return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (sha1 && (opts.size ?? 0) >= RESUMABLE_MIN_SIZE) {
    const part = partFor(dest, sha1);
    const res2 = await httpRequest(url, { onProgress, mirrors, toFile: part, signal: opts.signal });
    if (!res2.ok) { console.warn("Fallo descarga: " + url); return false; }
    if (await sha1File(part) !== sha1.toLowerCase()) {
      fs.rmSync(part, { force: true });
      throw new Error(`SHA1 no coincide: ${url}`);
    }
    fs.rmSync(dest, { force: true });
    fs.renameSync(part, dest);
    rememberSha1(dest, sha1);
    return true;
  }
  const res = await httpRequest(url, { onProgress, mirrors, signal: opts.signal });
  if (!res.ok) { console.warn("Fallo descarga: " + url); return false; }
  const buf = res.body;
  if (sha1) {
    const got = crypto.createHash("sha1").update(buf).digest("hex");
    if (got.toLowerCase() !== sha1.toLowerCase()) throw new Error(`SHA1 no coincide: ${url}`);
  }
  fs.writeFileSync(dest, buf);
  if (sha1) rememberSha1(dest, sha1);
  return true;
}
async function fetchJson(url) {
  const res = await httpRequest(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return readJson(res, url);
}
const PATCH_MIN_SIZE = 5 * 1024 * 1024;
const OP_COPY = 1;
const OP_DATA = 2;
function modKey(path2) {
  const slash = path2.lastIndexOf("/");
  const dir = slash >= 0 ? path2.slice(0, slash) : "";
  const name = path2.slice(slash + 1);
  const m = /^(.+?)[-_ ]v?\d[^/]*\.jar$/i.exec(name);
  return `${dir}/${(m ? m[1] : name).toLowerCase()}`;
}
function applyPatch(oldPath, patch, outPath) {
  if (patch.length < 33 || patch.toString("ascii", 0, 4) !== "DBRP" || patch.readUInt8(4) !== 1) {
    throw new Error("Parche no válido");
  }
  const expectedSha = patch.subarray(5, 25).toString("hex");
  const size = Number(patch.readBigInt64BE(25));
  const hash = crypto.createHash("sha1");
  const oldFd = fs.openSync(oldPath, "r");
  const outFd = fs.openSync(outPath, "w");
  let written = 0;
  const emit = (buf) => {
    written += buf.length;
    if (written > size) throw new Error("Parche más largo de lo que declara");
    fs.writeSync(outFd, buf);
    hash.update(buf);
  };
  try {
    const chunk = Buffer.alloc(1 << 16);
    let p = 33;
    while (p < patch.length) {
      const op = patch.readUInt8(p);
      if (op === OP_COPY) {
        let off = Number(patch.readBigInt64BE(p + 1));
        let len = Number(patch.readBigInt64BE(p + 9));
        p += 17;
        while (len > 0) {
          const n = fs.readSync(oldFd, chunk, 0, Math.min(len, chunk.length), off);
          if (n <= 0) throw new Error("COPY fuera del archivo viejo");
          emit(chunk.subarray(0, n));
          off += n;
          len -= n;
        }
      } else if (op === OP_DATA) {
        const len = Number(patch.readBigInt64BE(p + 1));
        if (p + 9 + len > patch.length) throw new Error("Parche cortado");
        emit(patch.subarray(p + 9, p + 9 + len));
        p += 9 + len;
      } else {
        throw new Error(`Op desconocida en el parche: ${op}`);
      }
    }
    if (written !== size) throw new Error(`Tamaño del resultado: ${written}, esperado ${size}`);
    if (hash.digest("hex") !== expectedSha) throw new Error("sha1 del resultado no coincide");
  } catch (e) {
    fs.closeSync(outFd);
    fs.rmSync(outPath, { force: true });
    throw e;
  } finally {
    fs.closeSync(oldFd);
  }
  fs.closeSync(outFd);
}
async function tryPatch(dest, newSha, candidates, onProgress, signal) {
  for (const old of new Set(candidates)) {
    if (!fs.existsSync(old)) continue;
    try {
      const oldSha = await sha1FileCached(old);
      if (oldSha === newSha) continue;
      const res = await httpRequest(`${CONFIG.assetMirrorBase}${oldSha}-${newSha}.dbrpatch`, { onProgress, signal });
      if (!res.ok) continue;
      const out = `${dest}.${newSha.slice(0, 8)}.patched`;
      applyPatch(old, res.body, out);
      fs.rmSync(dest, { force: true });
      fs.renameSync(out, dest);
      rememberSha1(dest, newSha);
      return true;
    } catch (e) {
      if (isAbortError(e)) throw e;
      console.warn(`[sync] parche de ${dest} falló, se baja completo:`, e);
    }
  }
  return false;
}
const CONCURRENCY$1 = 8;
async function pool(items, limit, task) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await task(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
function loadManaged(managedFile) {
  try {
    const j = JSON.parse(fs.readFileSync(managedFile, "utf-8"));
    return Array.isArray(j.files) ? j.files : [];
  } catch {
    return [];
  }
}
function saveManaged(managedFile, files) {
  fs.writeFileSync(managedFile, JSON.stringify({ files }), "utf-8");
}
function safeJoin(base, rel) {
  const target = path.normalize(path.join(base, rel));
  const root = path.normalize(base.endsWith(path.sep) ? base : base + path.sep);
  if (!target.startsWith(root)) throw new Error(`Ruta insegura en manifest: ${rel}`);
  return target;
}

async function runSync(opts, onProgress) {
  const { gameDir, managedFile, reseed = false, signal } = opts;
  const modsDest = path.join(gameDir, "mods");
  fs.mkdirSync(modsDest, { recursive: true });

  // Posibles ubicaciones de la carpeta MODS local
  const candidates = [
    path.join(process.cwd(), "MODS"),
    path.join(electron.app.getAppPath(), "..", "..", "MODS"),
    path.join(electron.app.getAppPath(), "..", "MODS"),
    path.join(path.dirname(process.execPath), "MODS"),
    "C:\\Users\\GSDav\\Downloads\\DBZ\\MODS"
  ];

  let localModsDir = candidates.find(p => fs.existsSync(p));
  if (!localModsDir) {
    localModsDir = path.join(process.cwd(), "MODS");
    fs.mkdirSync(localModsDir, { recursive: true });
  }

  const modFiles = fs.readdirSync(localModsDir).filter(f => f.endsWith(".jar") || f.endsWith(".zip"));
  let updated = 0;
  let done = 0;
  const total = modFiles.length;

  for (const f of modFiles) {
    signal?.throwIfAborted();
    const srcFile = path.join(localModsDir, f);
    const destFile = path.join(modsDest, f);
    onProgress({ phase: "check", file: "mods/" + f, done: ++done, total });

    let copyNeeded = true;
    if (fs.existsSync(destFile)) {
      const srcStat = fs.statSync(srcFile);
      const destStat = fs.statSync(destFile);
      if (srcStat.size === destStat.size) {
        copyNeeded = false;
      }
    }

    if (copyNeeded) {
      onProgress({ phase: "download", file: "mods/" + f, done, total, inFlight: 0, bytesDone: 0, bytesTotal: 0 });
      fs.copyFileSync(srcFile, destFile);
      updated++;
    }
  }

  // Copiar Textura si está en MODS a resourcepacks
  const texture = modFiles.find(f => f.toLowerCase().includes("texture") && f.endsWith(".zip"));
  if (texture) {
    const rpDir = path.join(gameDir, "resourcepacks");
    fs.mkdirSync(rpDir, { recursive: true });
    const rpDest = path.join(rpDir, texture);
    const rpSrc = path.join(localModsDir, texture);
    if (!fs.existsSync(rpDest) || fs.statSync(rpSrc).size !== fs.statSync(rpDest).size) {
      fs.copyFileSync(rpSrc, rpDest);
    }
  }

  return { updated, removed: 0, version: "DBR-Local-2026" };
}
/* ORIGINAL_RUN_SYNC_REPLACED */
async function _original_runSync(opts, onProgress) {

  const { gameDir, managedFile, manifestUrl, reseed = false, langInicial: langInicial2, signal } = opts;
  const manifest = await fetchManifest(manifestUrl);
  fs.mkdirSync(gameDir, { recursive: true });
  const checkTotal = manifest.files.length;
  const needed = new Array(checkTotal).fill(false);
  let checked = 0;
  await pool(manifest.files, CONCURRENCY$1, async (f, i) => {
    signal?.throwIfAborted();
    const dest = safeJoin(gameDir, f.path);
    let needs = true;
    if (fs.existsSync(dest)) {
      needs = f.once ? reseed : f.sha1 ? await sha1FileCached(dest) !== f.sha1.toLowerCase() : false;
    }
    needed[i] = needs;
    onProgress({ phase: "check", file: f.path, done: ++checked, total: checkTotal });
  });
  const toDownload = manifest.files.filter((_, i) => needed[i]);
  const opciones2 = toDownload.find((f) => f.once && f.path === "options.txt");
  const langPrevio = opciones2 ? langActual(safeJoin(gameDir, opciones2.path)) : null;
  const managedPaths = manifest.files.filter((f) => !f.once).map((f) => f.path);
  const wantedPaths = new Set(manifest.files.map((f) => f.path));
  const toDelete = loadManaged(managedFile).filter((p) => !wantedPaths.has(p));
  const total = toDownload.length + toDelete.length;
  let done = 0;
  const keepParts = new Set(toDownload.filter((f) => f.sha1).map((f) => partFor(safeJoin(gameDir, f.path), f.sha1)));
  for (const dir of new Set(manifest.files.map((f) => path.dirname(safeJoin(gameDir, f.path))))) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      const full = path.join(dir, n);
      if ((n.endsWith(".part") || n.endsWith(".patched")) && !keepParts.has(full)) fs.rmSync(full, { force: true });
    }
  }
  const knownSizes = toDownload.every((f) => typeof f.size === "number");
  let bytesTotal = knownSizes ? toDownload.reduce((s, f) => s + (f.size ?? 0), 0) : 0;
  const received = /* @__PURE__ */ new Map();
  const expected = /* @__PURE__ */ new Map();
  const expect = (path2, bytes) => {
    if (!knownSizes) return;
    bytesTotal += bytes - (expected.get(path2) ?? 0);
    expected.set(path2, bytes);
  };
  for (const f of toDownload) expected.set(f.path, f.size ?? 0);
  const inFlight = /* @__PURE__ */ new Set();
  let lastEmit = 0;
  const emit = (force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < 100) return;
    lastEmit = now;
    let bytesDone = 0;
    for (const n of received.values()) bytesDone += n;
    const current2 = inFlight.values().next().value ?? "";
    onProgress({
      phase: "download",
      file: current2,
      done,
      total,
      inFlight: Math.max(0, inFlight.size - 1),
      bytesDone: Math.min(bytesDone, bytesTotal),
      bytesTotal
    });
  };
  await pool(toDownload, CONCURRENCY$1, async (f) => {
    inFlight.add(f.path);
    emit(true);
    try {
      const dest = safeJoin(gameDir, f.path);
      if (f.sha1 && (f.size ?? 0) >= PATCH_MIN_SIZE && /\.jar$/i.test(f.path)) {
        const key = modKey(f.path);
        const candidates = [dest, ...toDelete.filter((p) => modKey(p) === key).map((p) => safeJoin(gameDir, p))];
        const patched = await tryPatch(dest, f.sha1.toLowerCase(), candidates, (n, t2) => {
          if (t2 > 0) expect(f.path, t2);
          received.set(f.path, n);
          emit();
        }, signal);
        if (patched) {
          received.set(f.path, expected.get(f.path) ?? 0);
          return;
        }
        expect(f.path, f.size ?? 0);
        received.set(f.path, 0);
      }
      const mirrors = f.sha1 ? [CONFIG.assetMirrorBase + f.sha1.toLowerCase()] : [];
      await ensureFile(
        dest,
        f.url,
        f.sha1,
        (n) => {
          received.set(f.path, n);
          emit();
        },
        mirrors,
        { size: f.size, signal }
      );
      received.set(f.path, f.size ?? 0);
    } finally {
      inFlight.delete(f.path);
      done++;
      emit(true);
    }
  });
  if (opciones2 && langInicial2 !== void 0) {
    aplicarLang(safeJoin(gameDir, opciones2.path), langPrevio, langInicial2);
  }
  const pending = [];
  for (const p of toDelete) {
    onProgress({ phase: "delete", file: p, done, total });
    const dest = safeJoin(gameDir, p);
    try {
      fs.rmSync(dest);
    } catch {
      if (fs.existsSync(dest)) pending.push(p);
    }
    done++;
  }
  saveManaged(managedFile, [...managedPaths, ...pending]);
  flushHashCache();
  if (pending.length) {
    throw new Error(
      `No se pudo borrar ${pending.join(", ")}. Cierra Minecraft si sigue abierto y vuelve a intentarlo.`
    );
  }
  onProgress({ phase: "done", file: "", done: total, total });
  return { updated: toDownload.length, removed: toDelete.length, version: manifest.version };
}
function manifestUrlForVariant() {
  switch (loadSettings().modpackVariant) {
    case "lite":
      return CONFIG.manifestUrlLite;
    case "experimental":
      return CONFIG.manifestUrlExperimental;
    default:
      return CONFIG.manifestUrl;
  }
}
let current = null;
function registerSync() {
  electron.ipcMain.handle("sync:cancel", () => current?.abort());
  electron.ipcMain.handle("sync:start", async (e) => {
    const ctrl = new AbortController();
    current = ctrl;
    try {
      if (!isManifestConfigured()) {
        return { ok: true, summary: { updated: 0, removed: 0, version: "" } };
      }
      const reseed = loadSettings().modpackSeedPending;
      const summary = await runSync(
        {
          gameDir: getGameDir(),
          managedFile: getManagedFile(),
          manifestUrl: manifestUrlForVariant(),
          reseed,
          langInicial: langInicial(),
          signal: ctrl.signal
        },
        (p) => e.sender.send("sync:progress", p)
      );
      if (reseed) saveSettings({ modpackSeedPending: false });
      if (loadSettings().modpackSyncPending) saveSettings({ modpackSyncPending: false });
      return { ok: true, summary };
    } catch (err) {
      if (ctrl.signal.aborted || isAbortError(err)) return { ok: false, error: "", cancelled: true };
      return { ok: false, error: errMsg(err) };
    } finally {
      if (current === ctrl) current = null;
    }
  });
}
function currentPlatform() {
  const os2 = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";
  const arch = os2 === "linux" && process.arch === "arm64" ? "aarch64" : "x64";
  return { os: os2, arch, ext: os2 === "windows" ? "zip" : "tar.gz" };
}
function adoptiumUrl(pl) {
  return `https://api.adoptium.net/v3/binary/latest/8/ga/${pl.os}/${pl.arch}/jre/hotspot/normal/eclipse`;
}
const EOCD_SIG = 101010256;
const CDH_SIG = 33639248;
function findEocd(buf) {
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}
function isExcluded(name, exclude) {
  return exclude.some(
    (e) => e.endsWith("/") ? name.startsWith(e) : name === e || name.startsWith(`${e}/`)
  );
}
function safeDest(destDir, name) {
  const dest = path.normalize(path.join(destDir, name));
  const root = path.normalize(destDir).endsWith(path.sep) ? path.normalize(destDir) : path.normalize(destDir) + path.sep;
  if (dest !== path.normalize(destDir) && !dest.startsWith(root)) {
    throw new Error(`Ruta insegura en el archivo: ${name}`);
  }
  return dest;
}
function extractZip(archiveFile, destDir, exclude = []) {
  const buf = fs.readFileSync(archiveFile);
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error("ZIP inválido: no se encontró el End of Central Directory.");
  const count = buf.readUInt16LE(eocd + 10);
  if (count === 65535) throw new Error("ZIP inválido o ZIP64 no soportado.");
  let off = buf.readUInt32LE(eocd + 16);
  fs.mkdirSync(destDir, { recursive: true });
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== CDH_SIG) throw new Error("ZIP inválido: central directory corrupto.");
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const externalAttr = buf.readUInt32LE(off + 38);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    off += 46 + nameLen + extraLen + commentLen;
    if (!name || isExcluded(name, exclude)) continue;
    const dest = safeDest(destDir, name);
    if (name.endsWith("/")) {
      fs.mkdirSync(dest, { recursive: true });
      continue;
    }
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`ZIP: método de compresión no soportado (${method}) en ${name}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    if (process.platform !== "win32") {
      const mode = externalAttr >>> 16 & 4095;
      if (mode) fs.chmodSync(dest, mode);
    }
  }
}
async function downloadArchive(pl, destFile, onProgress) {
  const url = adoptiumUrl(pl);
  const res = await httpRequest(url, {
    onProgress: (received, total) => {
      if (total > 0) onProgress({ phase: "download", percent: Math.round(received / total * 100) });
    }
  });
  if (!res.ok) throw new Error(tr("err.java_descarga", { status: res.status }));
  fs.writeFileSync(destFile, res.body);
}
function extractArchive(archiveFile, destDir, exclude = []) {
  fs.mkdirSync(destDir, { recursive: true });
  const lower = archiveFile.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
    return extractTarGz(archiveFile, destDir, exclude);
  }
  extractZip(archiveFile, destDir, exclude);
  return Promise.resolve();
}
function extractTarGz(archiveFile, destDir, exclude) {
  const excludeArgs = exclude.flatMap((e) => ["--exclude", e.endsWith("/") ? `${e}*` : e]);
  return new Promise((resolve, reject) => {
    const p = child_process.spawn("tar", ["-xf", archiveFile, "-C", destDir, ...excludeArgs]);
    let err = "";
    p.stderr.on("data", (d) => err += d);
    p.on("error", (e) => reject(new Error(`No se pudo ejecutar tar: ${e.message}`)));
    p.on(
      "close",
      (code) => code === 0 ? resolve() : reject(new Error(`Fallo al extraer (tar ${code}): ${err}`))
    );
  });
}
function locateJava(root) {
  const exe = process.platform === "win32" ? "java.exe" : "java";
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    if (depth > 6) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) queue.push({ dir: full, depth: depth + 1 });
      else if (e.isFile() && e.name === exe && path.basename(dir) === "bin") return full;
    }
  }
  return null;
}
function verifyJava(javaPath) {
  return new Promise((resolve, reject) => {
    const p = child_process.spawn(javaPath, ["-version"]);
    let out = "";
    p.stdout.on("data", (d) => out += d);
    p.stderr.on("data", (d) => out += d);
    p.on("error", (e) => reject(new Error(`No se pudo ejecutar java: ${e.message}`)));
    p.on("close", () => {
      if (!/(^|[^\d])1\.8\./.test(out)) {
        reject(new Error(tr("err.java_no_8", { detalle: out.split("\n")[0] })));
        return;
      }
      const m = out.match(/version "([^"]+)"/);
      resolve(m ? m[1] : "1.8");
    });
  });
}
async function installJava(destDir, pl, onProgress) {
  fs.mkdirSync(destDir, { recursive: true });
  const archive = path.join(destDir, `jre8.${pl.ext}`);
  onProgress({ phase: "download", percent: 0 });
  await downloadArchive(pl, archive, onProgress);
  onProgress({ phase: "extract" });
  const extractDir = path.join(destDir, "extracted");
  fs.rmSync(extractDir, { recursive: true, force: true });
  await extractArchive(archive, extractDir);
  const javaPath = locateJava(extractDir);
  if (!javaPath) throw new Error("No se encontró el ejecutable java tras extraer el JRE.");
  onProgress({ phase: "verify" });
  const version = await verifyJava(javaPath);
  if (fs.existsSync(archive)) fs.rmSync(archive, { force: true });
  return { javaPath, version };
}
const getRuntimeDir = () => path.join(electron.app.getPath("userData"), "runtime", "jre8");
const getRuntimeInfoFile = () => path.join(electron.app.getPath("userData"), "runtime", "jre8.json");
let cached;
function getJavaInfo() {
  if (cached !== void 0) return cached;
  try {
    const info = JSON.parse(fs.readFileSync(getRuntimeInfoFile(), "utf-8"));
    cached = fs.existsSync(info.path) ? info : null;
  } catch {
    cached = null;
  }
  return cached;
}
async function ensureJava(onProgress) {
  const existing = getJavaInfo();
  if (existing && fs.existsSync(existing.path)) return existing;
  cached = void 0;
  const pl = currentPlatform();
  const { javaPath, version } = await installJava(getRuntimeDir(), pl, onProgress);
  const info = { path: javaPath, version, os: pl.os, arch: pl.arch };
  fs.mkdirSync(path.dirname(getRuntimeInfoFile()), { recursive: true });
  fs.writeFileSync(getRuntimeInfoFile(), JSON.stringify(info), "utf-8");
  cached = info;
  return info;
}
function registerJava() {
  electron.ipcMain.handle("java:get", () => getJavaInfo());
  electron.ipcMain.handle("java:ensure", async (e) => {
    try {
      const info = await ensureJava((p) => e.sender.send("java:progress", p));
      return { ok: true, info };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });
}
function substituteGameArgs(template, ctx) {
  const map = {
    auth_player_name: ctx.username,
    version_name: ctx.versionName,
    game_directory: ctx.gameDir,
    assets_root: ctx.assetsDir,
    game_assets: ctx.assetsDir,
    assets_index_name: ctx.assetIndex,
    auth_uuid: ctx.uuid,
    auth_access_token: ctx.accessToken,
    auth_session: `token:${ctx.accessToken}:${ctx.uuid}`,
    user_properties: "{}",
    user_type: ctx.userType
  };
  return template.trim().split(/\s+/).map((tok) => tok.replace(/\$\{(\w+)\}/g, (_m, k) => map[k] ?? `\${${k}}`));
}
function buildLaunchArgs(ctx) {
  const jvm = [
    `-Xmx${ctx.ramGb}G`,
    "-Xms512M",
    `-Djava.library.path=${ctx.nativesDir}`,
    `-Dminecraft.launcher.brand=DbrLauncher`,
    ...ctx.extraJvm ?? [],
    "-cp",
    ctx.classpath.join(path.delimiter)
  ];
  const game = substituteGameArgs(ctx.minecraftArguments, ctx);
  if (ctx.width) game.push("--width", String(ctx.width));
  if (ctx.height) game.push("--height", String(ctx.height));
  if (ctx.fullscreen) game.push("--fullscreen");
  return [...jvm, ctx.mainClass, ...game];
}
function mergeVersions(base, overlay) {
  return {
    id: overlay.id,
    mainClass: overlay.mainClass || base.mainClass,
    minecraftArguments: overlay.minecraftArguments || base.minecraftArguments,
    libraries: [...overlay.libraries, ...base.libraries],
    assetIndex: base.assetIndex,
    assets: base.assets,
    downloads: base.downloads
  };
}
const librariesDir = () => path.join(electron.app.getPath("userData"), "libraries");
const assetsDir = () => path.join(electron.app.getPath("userData"), "assets");
const versionsDir = () => path.join(electron.app.getPath("userData"), "versions");
const VERSION_MANIFEST = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
function readCached(file) {
  try {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : null;
  } catch {
    return null;
  }
}
function writeCached(file, v) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(v));
  } catch {
  }
}
async function fetchVanilla(id) {
  const file = path.join(versionsDir(), id, `${id}.json`);
  const cached2 = readCached(file);
  if (cached2) return cached2;
  const index = await fetchJson(VERSION_MANIFEST);
  const entry = index.versions.find((v2) => v2.id === id);
  if (!entry) throw new Error(`La versión ${id} no está en el manifest de Mojang.`);
  const v = await fetchJson(entry.url);
  writeCached(file, v);
  return v;
}
async function fetchForge() {
  const file = path.join(versionsDir(), "forge-overlay.json");
  try {
    const v = await fetchJson(CONFIG.forgeJsonUrl);
    writeCached(file, v);
    return v;
  } catch (e) {
    const cached2 = readCached(file);
    if (cached2) return cached2;
    throw e;
  }
}
function osName(platform = process.platform) {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "osx";
  return "linux";
}
function archBits(arch = process.arch) {
  return arch === "x64" || arch === "arm64" ? "64" : "32";
}
function rulesAllow(rules, platform = process.platform) {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const r of rules) {
    const matches = !r.os?.name || r.os.name === osName(platform);
    if (matches) allowed = r.action === "allow";
  }
  return allowed;
}
function nativeClassifier(lib, platform = process.platform, arch = process.arch) {
  const key = lib.natives?.[osName(platform)];
  if (!key) return null;
  return key.replace("${arch}", archBits(arch));
}
function mavenToPath(name) {
  const [group, artifact, version, classifier] = name.split(":");
  const file = classifier ? `${artifact}-${version}-${classifier}.jar` : `${artifact}-${version}.jar`;
  return `${group.replace(/\./g, "/")}/${artifact}/${version}/${file}`;
}
const DEFAULT_MAVEN = "https://libraries.minecraft.net/";
function resolveArtifact(lib) {
  const path2 = lib.downloads?.artifact?.path ?? mavenToPath(lib.name);
  const url = lib.downloads?.artifact?.url ?? (lib.url ?? DEFAULT_MAVEN) + mavenToPath(lib.name);
  return { path: path2, url, sha1: lib.downloads?.artifact?.sha1, size: lib.downloads?.artifact?.size };
}
function resolveNative(lib, platform = process.platform, arch = process.arch) {
  const classifier = nativeClassifier(lib, platform, arch);
  if (!classifier) return null;
  const dl = lib.downloads?.classifiers?.[classifier];
  const nameWithClassifier = `${lib.name}:${classifier}`;
  const path2 = dl?.path ?? mavenToPath(nameWithClassifier);
  const url = dl?.url ?? (lib.url ?? DEFAULT_MAVEN) + mavenToPath(nameWithClassifier);
  return { path: path2, url, sha1: dl?.sha1, size: dl?.size, exclude: lib.extract?.exclude ?? [] };
}
async function installLibraries(libs, librariesDir2, nativesDir, onProgress) {
  const applicable = libs.filter((l) => rulesAllow(l.rules));
  const classpath = [];
  for (let i = 0; i < applicable.length; i++) {
    const lib = applicable[i];
    onProgress({
      phase: "libraries",
      percent: Math.round((i + 1) / applicable.length * 100),
      detail: lib.name
    });
    const native = resolveNative(lib);
    if (native) {
      const nativeJar = path.join(librariesDir2, native.path);
      const downloaded = await ensureFile(nativeJar, native.url, native.sha1);
      const marker = path.join(nativesDir, `.${path.basename(nativeJar)}.extracted`);
      if (downloaded || !fs.existsSync(marker)) {
        await extractArchive(nativeJar, nativesDir, native.exclude);
        fs.writeFileSync(marker, native.sha1 ?? "");
      }
    }
    const hasArtifact = !!lib.downloads?.artifact || !lib.natives;
    if (hasArtifact) {
      const art = resolveArtifact(lib);
      const dest = path.join(librariesDir2, art.path);
      await ensureFile(dest, art.url, art.sha1);
      classpath.push(dest);
    }
  }
  return classpath;
}
const RESOURCES = "https://resources.download.minecraft.net";
const CONCURRENCY = 12;
async function installAssets(ref, assetsDir2, onProgress) {
  const indexPath = path.join(assetsDir2, "indexes", `${ref.id}.json`);
  await ensureFile(indexPath, ref.url, ref.sha1);
  const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  const objects = Object.values(index.objects);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < objects.length) {
      const { hash } = objects[next++];
      const sub = hash.slice(0, 2);
      const dest = path.join(assetsDir2, "objects", sub, hash);
      if (!fs.existsSync(dest)) await ensureFile(dest, `${RESOURCES}/${sub}/${hash}`, hash);
      done++;
      if (done % 25 === 0 || done === objects.length) {
        onProgress({ phase: "assets", percent: Math.round(done / objects.length * 100) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, objects.length) }, worker));
}
function readGameLogTail(lines = 60) {
  const logPath = path.join(getGameDir(), "launcher-game.log");
  if (!fs.existsSync(logPath)) return "";
  const all = fs.readFileSync(logPath, "utf-8").split(/\r?\n/);
  return all.slice(-lines).join("\n").trim();
}
async function prepare(onProgress) {
  onProgress({ phase: "version" });
  const vanilla = await fetchVanilla(CONFIG.minecraft);
  const version = isForgeConfigured() ? mergeVersions(vanilla, await fetchForge()) : vanilla;
  const vDir = path.join(versionsDir(), version.id);
  const nativesDir = path.join(vDir, "natives");
  const clientJar = path.join(vDir, `${version.id}.jar`);
  if (version.downloads?.client) {
    onProgress({ phase: "client", detail: "client.jar" });
    await ensureFile(clientJar, version.downloads.client.url, version.downloads.client.sha1);
  }
  const classpath = await installLibraries(version.libraries, librariesDir(), nativesDir, onProgress);
  classpath.push(clientJar);
  if (version.assetIndex) await installAssets(version.assetIndex, assetsDir(), onProgress);
  flushHashCache();
  return { version, classpath, nativesDir };
}
async function launch(onProgress, onStatus) {
  // Asegurar options.txt con DbrTexture v6.zip y servidor dragonblock.online configurados
  try {
    const gameDir = getGameDir();
    fs.mkdirSync(gameDir, { recursive: true });
    const optPath = path.join(gameDir, "options.txt");
    let optContent = fs.existsSync(optPath) ? fs.readFileSync(optPath, "utf-8") : "";

    // 1. Pack de texturas automático
    if (optContent.includes("resourcePacks:")) {
      optContent = optContent.replace(/resourcePacks:\[[^\]]*\]/g, 'resourcePacks:["DbrTexture v6.zip"]');
    } else {
      optContent += "\nresourcePacks:[\"DbrTexture v6.zip\"]";
    }

    // 2. Servidor automático por defecto
    if (optContent.includes("lastServer:")) {
      optContent = optContent.replace(/lastServer:.*\r?\n/g, 'lastServer:dragonblock.online:25625\n');
    } else {
      optContent += "\nlastServer:dragonblock.online:25625";
    }

    fs.writeFileSync(optPath, optContent, "utf-8");

    // 3. Copiar textura a resourcepacks del juego
    const rpDir = path.join(gameDir, "resourcepacks");
    fs.mkdirSync(rpDir, { recursive: true });
    const textureZip = path.join(rpDir, "DbrTexture v6.zip");
    const candidates = [
      path.join(process.cwd(), "DbrTexture v6.zip"),
      path.join(process.cwd(), "MODS", "DbrTexture v6.zip"),
      path.join(electron.app.getAppPath(), "..", "..", "MODS", "DbrTexture v6.zip"),
      path.join(electron.app.getAppPath(), "..", "MODS", "DbrTexture v6.zip"),
      path.join(path.dirname(process.execPath), "MODS", "DbrTexture v6.zip")
    ];
    const foundTex = candidates.find(p => fs.existsSync(p));
    if (foundTex && (!fs.existsSync(textureZip) || fs.statSync(foundTex).size !== fs.statSync(textureZip).size)) {
      fs.copyFileSync(foundTex, textureZip);
    }
  } catch(e) {
    console.error("[launch:options] Error setting auto texture & server:", e);
  }

  const account = loadAccount();
  if (!account) throw new Error(tr("err.sin_sesion"));
  const settings = loadSettings();
  const java = await ensureJava((jp) => onProgress({ phase: "java", percent: jp.percent }));
  const prep = await prepare(onProgress);
  if (!prep.version.minecraftArguments) {
    throw new Error("El JSON de versión no trae minecraftArguments (formato 1.13+ no soportado).");
  }
  const ctx = {
    username: account.username,
    uuid: account.uuid.replace(/-/g, ""),
    accessToken: await ensureMcToken() ?? "0",
    userType: account.type === "premium" ? "msa" : "legacy",
    versionName: prep.version.id,
    gameDir: getGameDir(),
    assetsDir: assetsDir(),
    assetIndex: prep.version.assets ?? CONFIG.minecraft,
    nativesDir: prep.nativesDir,
    classpath: prep.classpath,
    mainClass: prep.version.mainClass,
    minecraftArguments: prep.version.minecraftArguments,
    ramGb: settings.ramGb,
    extraJvm: settings.jvmArgs.trim() ? settings.jvmArgs.trim().split(/\s+/) : void 0,
    width: settings.width,
    height: settings.height,
    fullscreen: settings.fullscreen
  };
  const args = buildLaunchArgs(ctx);
  onProgress({ phase: "launching" });
  const gameDir = getGameDir();
  fs.mkdirSync(gameDir, { recursive: true });
  const exe = process.platform === "win32" ? java.path.replace(/java\.exe$/i, "javaw.exe") : java.path;
  const logFd = fs.openSync(path.join(gameDir, "launcher-game.log"), "w");
  const child = child_process.spawn(exe, args, {
    cwd: gameDir,
    detached: true,
    stdio: ["ignore", logFd, logFd]
  });
  child.unref();
  try {
    await new Promise((resolve, reject) => {
      child.once("spawn", () => {
        onStatus({ state: "running" });
        resolve();
      });
      child.once("error", (e) => reject(new Error(tr("err.java_iniciar", { detalle: e.message }))));
    });
  } finally {
    fs.closeSync(logFd);
  }
  child.on("exit", (code) => {
    const exitCode = code ?? -1;
    const logTail = exitCode !== 0 ? readGameLogTail() : void 0;
    onStatus({ state: "exited", code: exitCode, logTail });
  });
}
function registerLaunch() {
  electron.ipcMain.handle("launch:start", async (e) => {
    try {
      await launch(
        (p) => e.sender.send("launch:progress", p),
        (s) => e.sender.send("launch:status", s)
      );
      setTimeout(() => electron.app.quit(), 2e3);
      return { ok: true };
    } catch (err) {
      const error = errMsg(err);
      e.sender.send("launch:status", { state: "error", error });
      return { ok: false, error };
    }
  });
}
function writeVarInt(value) {
  const bytes = [];
  let v = value >>> 0;
  do {
    let temp = v & 127;
    v >>>= 7;
    if (v !== 0) temp |= 128;
    bytes.push(temp);
  } while (v !== 0);
  return Buffer.from(bytes);
}
function readVarInt(buf, offset) {
  let value = 0;
  let size = 0;
  let byte;
  do {
    if (offset + size >= buf.length) return null;
    byte = buf[offset + size];
    value |= (byte & 127) << 7 * size;
    size++;
    if (size > 5) return null;
  } while (byte & 128);
  return { value: value >>> 0, size };
}
function writeString(str) {
  const data = Buffer.from(str, "utf8");
  return Buffer.concat([writeVarInt(data.length), data]);
}
function writeUShort(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n, 0);
  return b;
}
function framePacket(data) {
  return Buffer.concat([writeVarInt(data.length), data]);
}
function buildHandshake(host, port) {
  const data = Buffer.concat([
    writeVarInt(0),
    // packet id
    writeVarInt(4),
    // protocol version (irrelevante para status)
    writeString(host),
    writeUShort(port),
    writeVarInt(1)
    // next state = status
  ]);
  return framePacket(data);
}
function buildStatusRequest() {
  return framePacket(writeVarInt(0));
}
function tryParseStatus(buf) {
  const lenRes = readVarInt(buf, 0);
  if (!lenRes) return null;
  const packetEnd = lenRes.size + lenRes.value;
  if (buf.length < packetEnd) return null;
  let off = lenRes.size;
  const idRes = readVarInt(buf, off);
  if (!idRes) return null;
  off += idRes.size;
  const strLen = readVarInt(buf, off);
  if (!strLen) return null;
  off += strLen.size;
  if (buf.length < off + strLen.value) return null;
  const json = buf.slice(off, off + strLen.value).toString("utf8");
  return JSON.parse(json);
}
function flattenMotd(desc) {
  if (desc == null) return "";
  if (typeof desc === "string") return desc;
  if (typeof desc === "object") {
    const d = desc;
    let out = d.text ?? "";
    if (Array.isArray(d.extra)) out += d.extra.map(flattenMotd).join("");
    return out;
  }
  return String(desc);
}
async function resolveTarget(host, port) {
  try {
    const recs = await dns.promises.resolveSrv(`_minecraft._tcp.${host}`);
    if (recs.length > 0) return { host: recs[0].name, port: recs[0].port };
  } catch {
  }
  return { host, port };
}
async function pingServer(host, port, timeoutMs = 5e3) {
  const target = await resolveTarget(host, port);
  return new Promise((resolve) => {
    const socket = net.connect(target.port, target.host);
    const started = Date.now();
    let buf = Buffer.alloc(0);
    let settled = false;
    const done = (s) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(s);
    };
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => done({ online: false, error: tr("err.ping_timeout") }));
    socket.on("error", (e) => done({ online: false, error: e.message }));
    socket.on("connect", () => {
      socket.write(buildHandshake(host, port));
      socket.write(buildStatusRequest());
    });
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      let parsed = null;
      try {
        parsed = tryParseStatus(buf);
      } catch {
        done({ online: false, error: tr("err.ping_invalido") });
        return;
      }
      if (parsed) {
        done({
          online: true,
          players: parsed.players?.online,
          max: parsed.players?.max,
          version: parsed.version?.name,
          motd: flattenMotd(parsed.description),
          latencyMs: Date.now() - started
        });
      }
    });
  });
}
function registerStatus() {
  electron.ipcMain.handle(
    "status:ping",
    () => pingServer(CONFIG.serverHost, CONFIG.serverPort)
  );
}
const { autoUpdater } = electronUpdater;
function isDebInstall() {
  if (process.platform !== "linux" || !electron.app.isPackaged) return false;
  try {
    return fs.readFileSync(path.join(process.resourcesPath, "package-type"), "utf8").trim() === "deb";
  } catch {
    return false;
  }
}
function registerUpdater(getWindow) {
  const send = (s) => getWindow()?.webContents.send("update:status", s);
  electron.ipcMain.handle("update:check", async () => {
    send({ state: "none" });
    return { state: "none" };
  });
  electron.ipcMain.handle("update:install", async () => false);
}
const FUSE_PATHS = [
  "/usr/lib/x86_64-linux-gnu/libfuse.so.2",
  "/lib/x86_64-linux-gnu/libfuse.so.2",
  "/usr/lib/libfuse.so.2",
  "/usr/lib64/libfuse.so.2",
  "/lib64/libfuse.so.2"
];
function run(cmd, args) {
  return new Promise((resolve) => {
    child_process.execFile(cmd, args, { timeout: 4e3 }, (err, stdout) => resolve(err ? "" : stdout));
  });
}
async function hasFuse() {
  const out = await run("ldconfig", ["-p"]);
  if (out) return out.includes("libfuse.so.2");
  return FUSE_PATHS.some((p) => fs.existsSync(p));
}
function readDistro() {
  try {
    const text = fs.readFileSync("/etc/os-release", "utf8");
    const pick = (key) => {
      const m = text.match(new RegExp(`^${key}=("?)(.*)\\1`, "m"));
      return (m?.[2] ?? "").toLowerCase();
    };
    return { id: pick("ID"), like: pick("ID_LIKE") };
  } catch {
    return { id: "", like: "" };
  }
}
function installCmdFor(id, like) {
  const family = `${id} ${like}`;
  if (/debian|ubuntu|mint|pop|elementary/.test(family))
    return "apt-get update && apt-get install -y libfuse2";
  if (/fedora|rhel|centos|rocky|almalinux/.test(family)) return "dnf install -y fuse-libs";
  if (/arch|manjaro|endeavour/.test(family)) return "pacman -S --noconfirm fuse2";
  if (/suse|opensuse/.test(family)) return "zypper install -y libfuse2";
  return "";
}
function registerFuse() {
  electron.ipcMain.handle("fuse:status", async () => {
    if (process.platform !== "linux") return { missing: false, canAutoInstall: false };
    if (!process.env.APPIMAGE) return { missing: false, canAutoInstall: false };
    if (await hasFuse()) return { missing: false, canAutoInstall: false };
    const { id, like } = readDistro();
    const installCmd = installCmdFor(id, like);
    const canAutoInstall = !!installCmd && !!await run("which", ["pkexec"]);
    return { missing: true, distro: id || void 0, installCmd: installCmd || void 0, canAutoInstall };
  });
  electron.ipcMain.handle("fuse:install", async () => {
    if (process.platform !== "linux") return { ok: false, error: tr("fuse.solo_linux") };
    const { id, like } = readDistro();
    const cmd = installCmdFor(id, like);
    if (!cmd) return { ok: false, error: tr("fuse.distro") };
    return new Promise((resolve) => {
      child_process.execFile("pkexec", ["sh", "-c", cmd], { timeout: 12e4 }, (err) => {
        if (err) resolve({ ok: false, error: err.message });
        else resolve({ ok: true });
      });
    });
  });
}
const CAT = "rendimiento";
const perfCfgPath = () => path.join(getGameDir(), "config", "dbrcore", "rendimiento.cfg");
function read() {
  try {
    return fs.readFileSync(perfCfgPath(), "utf-8");
  } catch {
    return "";
  }
}
const keyRe = (key) => new RegExp(`^(\\s*)([SBID]):${key}=(.*)$`, "m");
function getKey(key) {
  const m = keyRe(key).exec(read());
  return m ? m[3].trim() : null;
}
function setKey(key, value, type) {
  let text = read();
  const re = keyRe(key);
  if (re.test(text)) {
    text = text.replace(re, (_all, indent) => `${indent}${type}:${key}=${value}`);
  } else if (new RegExp(`^${CAT}\\s*\\{`, "m").test(text)) {
    text = text.replace(
      new RegExp(`(^${CAT}\\s*\\{[\\s\\S]*?)(^\\})`, "m"),
      (_all, body, close) => `${body}    ${type}:${key}=${value}
${close}`
    );
  } else {
    const sep = text && !text.endsWith("\n") ? "\n" : "";
    text = `${text}${sep}${CAT} {
    ${type}:${key}=${value}
}
`;
  }
  const file = perfCfgPath();
  if (!fs.existsSync(path.dirname(file))) fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf-8");
}
const RAM_JUSTA = 4 * 1024 ** 3;
const NUCLEOS_JUSTOS = 4;
const SOFTWARE = ["gdi generic", "llvmpipe", "softpipe", "swrast", "microsoft basic render"];
const NONE = { propose: false, reason: "", fromGame: false };
async function checkLite() {
  const s = loadSettings();
  if (s.modpackVariant !== "full") return NONE;
  if (getKey("recomendarLite") === "true") {
    return {
      propose: true,
      fromGame: true,
      reason: tr("lite.motivo_juego")
    };
  }
  if (s.liteProposal !== "none") return NONE;
  const senales = [];
  if (os.totalmem() < RAM_JUSTA) senales.push(tr("lite.ram", { gb: (os.totalmem() / 1024 ** 3).toFixed(1) }));
  const nucleos = os.cpus().length;
  if (nucleos <= NUCLEOS_JUSTOS) senales.push(tr("lite.nucleos", { n: nucleos }));
  const gpu = await gpuJusta();
  if (gpu) senales.push(gpu);
  if (senales.length < 2) return NONE;
  return { propose: true, fromGame: false, reason: tr("lite.detectado", { senales: senales.join(", ") }) };
}
async function gpuJusta() {
  try {
    const info = await Promise.race([
      electron.app.getGPUInfo("basic"),
      new Promise((resolve) => setTimeout(() => resolve(null), 1500))
    ]);
    if (!info) return null;
    const textos = JSON.stringify(info).toLowerCase();
    if (SOFTWARE.some((t2) => textos.includes(t2))) return tr("lite.gpu_software");
    if (intelAntigua(textos)) return tr("lite.gpu_antigua");
  } catch {
  }
  return null;
}
function intelAntigua(t2) {
  if (!t2.includes("intel")) return false;
  if (/\bgma\b|q35|g41|g45/.test(t2)) return true;
  if (/uhd|iris|\barc\b/.test(t2)) return false;
  const m = /hd graphics(?:\s+(\d{3,4}))?/.exec(t2);
  if (!m) return false;
  return !m[1] || Number(m[1]) >= 1e3;
}
function answerLite(accept) {
  saveSettings({ liteProposal: accept ? "accepted" : "rejected" });
  try {
    setKey("recomendarLite", "false", "B");
    setKey("launcher", accept ? "aceptada" : "rechazada", "S");
  } catch {
  }
}
function registerPerf() {
  electron.ipcMain.handle("perf:check", () => checkLite());
  electron.ipcMain.handle("perf:answer", (_e, accept) => answerLite(Boolean(accept)));
}
electron.app.disableHardwareAcceleration();
let mainWindow = null;
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1e3,
    height: 640,
    resizable: false,
    show: false,
    frame: false,
    backgroundColor: "#0b0e0c",
    autoHideMenuBar: true,
    title: "Dbr Launcher",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow = win;
  win.on("ready-to-show", () => win.show());
  win.on("closed", () => mainWindow = null);
  win.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  

  electron.ipcMain.on("window:minimize", (e) => electron.BrowserWindow.fromWebContents(e.sender)?.minimize());
  electron.ipcMain.on("window:close", (e) => electron.BrowserWindow.fromWebContents(e.sender)?.close());
  electron.ipcMain.on("app:open-folder", () => electron.shell.openPath(electron.app.getPath("userData")));
  electron.ipcMain.handle("app:version", () => electron.app.getVersion());
  electron.ipcMain.handle("app:read-log", () => readGameLogTail(200));
  registerAuth();
  registerSync();
  registerJava();
  registerLaunch();
  registerSettings();
  registerStatus();
  registerUpdater(() => mainWindow);
  registerFuse();
  registerPerf();
  registerIdioma();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
