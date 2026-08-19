/* ============================================================
   ErgoAI — Selector de idioma (Kesta 23)
   ------------------------------------------------------------
   Usa el widget OFICIAL de Google Translate para traducir toda la
   página a cualquier idioma que la persona elija — cubre cientos de
   idiomas sin que nosotros tengamos que traducir nada a mano.

   Reglas del proyecto que esto respeta (aprendidas a las malas en
   fases anteriores, ver README → "Rendimiento y confiabilidad"):
   1. Se pide DESPUÉS de que la página ya cargó por completo (evento
      "load") — la cámara, la IA y la placa NUNCA esperan a esto.
   2. Si no hay internet, o el servicio de Google no responde, o
      cualquier cosa sale mal: el selector simplemente desaparece
      (#langSwitch se esconde) y el resto de ErgoAI sigue funcionando
      normal, en español, sin ningún error ni bloqueo.
   3. No toca NADA de la cámara/IA/placa — es 100% independiente,
      vive en su propio archivo a propósito.

   Aviso honesto (para quien lea esto después): esto SÍ necesita
   internet para funcionar de verdad — es un servicio externo de
   Google, no algo que corra localmente. Si el día de la feria el
   internet falla, el selector no va a aparecer, pero ErgoAI en
   español (el idioma real de la página) sigue funcionando exactamente
   igual — nunca es un requisito para nada más.
   ============================================================ */

(() => {
  'use strict';

  function startLanguageWidget() {
    const wrap = document.getElementById('langSwitch');
    if (!wrap) return;

    // Google llama a esta función global en cuanto termina de cargar
    // su script — así arma el selector dentro de #google_translate_element.
    window.googleTranslateElementInit = function googleTranslateElementInit() {
      try {
        // eslint-disable-next-line no-undef
        new google.translate.TranslateElement(
          {
            pageLanguage: 'es',
            // No forzar ningún idioma de entrada al abrir — que cada
            // quien elija el suyo desde el selector.
            autoDisplay: false,
          },
          'google_translate_element'
        );
      } catch (err) {
        console.warn('ErgoAI: no se pudo iniciar el selector de idioma.', err);
        wrap.hidden = true;
      }
    };

    const script = document.createElement('script');
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    script.onerror = () => {
      // Sin internet, o Google Translate bloqueado/caído — no dejar un
      // ícono de idioma vacío o roto ahí, mejor esconderlo entero.
      console.warn('ErgoAI: el selector de idioma no cargó (¿sin internet?) — el sitio sigue funcionando normal en español.');
      wrap.hidden = true;
    };
    document.body.appendChild(script);
  }

  if (document.readyState === 'complete') {
    startLanguageWidget();
  } else {
    window.addEventListener('load', startLanguageWidget, { once: true });
  }
})();
