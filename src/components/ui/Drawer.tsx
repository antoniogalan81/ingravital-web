"use client";

import type { ComponentProps, ReactNode } from "react";
import { Drawer as Vaul } from "vaul";

/**
 * Drawer base de Invergravital.
 *
 * Reexporta las primitivas de vaul con estilos Tailwind del proyecto
 * (paleta slate, esquinas redondeadas) y expone un wrapper sencillo
 * `<Drawer>` para los casos habituales.
 *
 * Uso rápido:
 *   <Drawer trigger={<button>Abrir</button>} title="Título">
 *     contenido…
 *   </Drawer>
 *
 * Uso compuesto (control total):
 *   <Drawer.Root>
 *     <Drawer.Trigger asChild><button>Abrir</button></Drawer.Trigger>
 *     <Drawer.Content>…</Drawer.Content>
 *   </Drawer.Root>
 */

const Root = Vaul.Root;
const Trigger = Vaul.Trigger;
const Close = Vaul.Close;
const Portal = Vaul.Portal;

function Overlay({ className = "", ...props }: ComponentProps<typeof Vaul.Overlay>) {
  return (
    <Vaul.Overlay
      className={`fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] ${className}`}
      {...props}
    />
  );
}

function Content({ className = "", children, ...props }: ComponentProps<typeof Vaul.Content>) {
  return (
    <Vaul.Content
      className={`fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90vh] flex-col rounded-t-2xl bg-white outline-none ${className}`}
      {...props}
    >
      {/* Asa de arrastre */}
      <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-slate-200" />
      {children}
    </Vaul.Content>
  );
}

function Title({ className = "", ...props }: ComponentProps<typeof Vaul.Title>) {
  return (
    <Vaul.Title
      className={`text-lg font-semibold text-slate-900 ${className}`}
      {...props}
    />
  );
}

function Description({ className = "", ...props }: ComponentProps<typeof Vaul.Description>) {
  return (
    <Vaul.Description
      className={`text-sm text-slate-500 ${className}`}
      {...props}
    />
  );
}

type DrawerProps = ComponentProps<typeof Vaul.Root> & {
  /** Elemento que abre el drawer. */
  trigger?: ReactNode;
  /** Título accesible (recomendado por vaul/Radix). */
  title?: ReactNode;
  /** Descripción opcional bajo el título. */
  description?: ReactNode;
  /** Contenido del drawer. */
  children?: ReactNode;
  /** Clases extra para el `<Content>`. */
  contentClassName?: string;
};

/**
 * Wrapper sencillo: trigger + overlay + content con cabecera ya montados.
 * Para layouts a medida, usa las primitivas: `Drawer.Root`, `Drawer.Content`, etc.
 */
function Drawer({
  trigger,
  title,
  description,
  children,
  contentClassName = "",
  ...rootProps
}: DrawerProps) {
  return (
    <Root {...rootProps}>
      {trigger ? <Trigger asChild>{trigger}</Trigger> : null}
      <Portal>
        <Overlay />
        <Content className={contentClassName}>
          <div className="flex flex-col gap-1 px-5 pt-4 pb-2">
            {title ? <Title>{title}</Title> : null}
            {description ? <Description>{description}</Description> : null}
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Content>
      </Portal>
    </Root>
  );
}

Drawer.Root = Root;
Drawer.Trigger = Trigger;
Drawer.Close = Close;
Drawer.Portal = Portal;
Drawer.Overlay = Overlay;
Drawer.Content = Content;
Drawer.Title = Title;
Drawer.Description = Description;

export default Drawer;
export { Root, Trigger, Close, Portal, Overlay, Content, Title, Description };
