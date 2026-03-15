declare module 'react-grid-layout' {
  import * as React from 'react';

  export interface LayoutItem {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
    static?: boolean;
    isDraggable?: boolean;
    isResizable?: boolean;
  }

  export interface ResponsiveProps {
    className?: string;
    layouts?: { [P: string]: LayoutItem[] };
    breakpoints?: { [P: string]: number };
    cols?: { [P: string]: number };
    rowHeight?: number;
    width?: number;
    isDraggable?: boolean;
    isResizable?: boolean;
    draggableHandle?: string;
    draggableCancel?: string;
    onLayoutChange?: (layout: LayoutItem[], layouts?: { [P: string]: LayoutItem[] }) => void;
    onBreakpointChange?: (newBreakpoint: string, newCols: number) => void;
    margin?: [number, number];
    containerPadding?: [number, number];
    useCSSTransforms?: boolean;
    children?: React.ReactNode;
  }

  export class Responsive extends React.Component<ResponsiveProps> {}

  export function WidthProvider<P extends object>(
    component: React.ComponentType<P>
  ): React.ComponentType<Omit<P, 'width'>>;
}

declare module 'react-grid-layout/css/styles.css' {}
declare module 'react-resizable/css/styles.css' {}
