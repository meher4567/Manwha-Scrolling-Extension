// Extension Settings
export interface SmartScrollSettings {
  enabled: boolean;
  scrollSpeed: number;
  textDetection: boolean;
  autoAdjust: boolean;
  skipWhitespace: boolean;
  mode: 'standard' | 'immersive' | 'speed' | 'study';
  sensitivity: number;
  pauseOnHover: boolean;
  smoothness: number;
  readingMode: 'normal' | 'focus' | 'skim' | 'binge';
  autoPauseAtChapterEnd: boolean;
  autoAdvanceChapter: boolean;
  waitForImages: boolean;
  emergencyStopOnShake: boolean;
  learningModeEnabled: boolean;  // ML learning feature
}

// Content Analysis Results
export interface ContentAnalysis {
  textDensity: number;
  hasImages: boolean;
  whitespaceRatio: number;
  panelBoundaries: PanelBoundary[];
  contentType: ContentType;
  averageTextSize: number;
}

export interface PanelBoundary {
  top: number;
  bottom: number;
  height: number;
  type: 'panel' | 'whitespace' | 'chapter-break';
}

export type ContentType = 'dialogue' | 'action' | 'narration' | 'mixed' | 'unknown';

// Scroll State
export interface ScrollState {
  isScrolling: boolean;
  currentSpeed: number;
  targetSpeed: number;
  position: number;
  isPaused: boolean;
  mode: string;
}

// Message Types for Extension Communication
export interface ExtensionMessage {
  action: string;
  data?: any;
  enabled?: boolean;
}

// User Reading Pattern
export interface ReadingPattern {
  averageSpeed: number;
  pauseLocations: number[];
  totalReadingTime: number;
  contentPreferences: {
    [key in ContentType]: number;
  };
}

// Viewport Information
export interface ViewportInfo {
  height: number;
  width: number;
  scrollY: number;
  totalHeight: number;
  visibleContent: VisibleContent;
}

export interface VisibleContent {
  textElements: number;
  imageElements: number;
  whitespacePercent: number;
  dominantColor?: string;
}

// ML Learning System
export interface SpeedAdjustment {
  timestamp: number;
  contentType: ContentType;
  previousSpeed: number;
  newSpeed: number;
  textDensity: number;
  url: string;
}

export interface LearnedPreferences {
  contentTypePreferences: {
    [key in ContentType]?: {
      averageSpeed: number;
      confidence: number;  // 0-1 scale
      dataPoints: number;
      lastUpdated: number;
    };
  };
  textDensityPreferences: {
    low: number;    // < 0.4
    medium: number; // 0.4-0.7
    high: number;   // > 0.7
  };
  totalAdjustments: number;
  learningStarted: number;
}

export interface LearningStats {
  totalDataPoints: number;
  chaptersCounted: number;
  confidenceScore: number;  // Overall confidence 0-100
  learnedPreferences: LearnedPreferences;
  lastLearningDate: number;
}

