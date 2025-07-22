import '@testing-library/jest-dom'; import { configure } from '@testing-library/react'; import { TextEncoder, TextDecoder } from 'util';
// Polyfills global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder as any;
// Configure testing library configure({ testIdAttribute: 'data-testid' });
// Mock window.matchMedia Object.defineProperty(window, 'matchMedia', { writable: true, value: jest.fn().mockImplementation(query => ({ matches: false, media: query, onchange: null, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(), })), });
// Mock IntersectionObserver global.IntersectionObserver = class IntersectionObserver { constructor() {} disconnect() {} observe() {} unobserve() {} } as any;
// Mock localStorage const localStorageMock = { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), clear: jest.fn(), length: 0, key: jest.fn(), }; global.localStorage = localStorageMock as any;
// Mock fetch global.fetch = jest.fn();
// Suppress console errors in tests const originalError = console.error; beforeAll(() => { console.error = (...args) => { if ( typeof args[0] === 'string' && args[0].includes('Warning: ReactDOM.render') ) { return; } originalError.call(console, ...args); }; });
afterAll(() => { console.error = originalError; });
