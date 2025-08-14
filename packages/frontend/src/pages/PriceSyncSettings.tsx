// packages/frontend/src/pages/PriceSyncSettings.tsx
import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Save, Edit2, AlertCircle, TrendingUp, Settings, Calendar, DollarSign, Percent } from 'lucide-react';
import apiService from '../services/api';

interface InitialPriceData {
  sku: string;
  productName: string;
  naverPrice: number;
  currentShopifyPrice: number;
  suggestedShopifyPrice: number;
  currentMargin: number;
  suggestedMargin: number;
  exchangeRate: number;
}

interface PriceSyncSettings {
  mode: 'auto' | 'manual';
  autoSync: boolean;
  defaultMargin: number;
  exchangeRateSource: 'api' | 'manual';
  customExchangeRate?: number;
  roundingStrategy: 'up' | 'down' | 'nearest';
  syncSchedule: string;
}

const PriceSyncSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PriceSyncSettings>({
    mode: 'manual',
    autoSync: false,
    defaultMargin: 15,
    exchangeRateSource: 'api',
    roundingStrategy: 'nearest',
    syncSchedule: '0 */6 * * *'
  });

  const [initialPrices, setInitialPrices] = useState<InitialPriceData[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingMargins, setEditingMargins] = useState<Map<string, number>>(new Map());
  const [currentExchangeRate, setCurrentExchangeRate] = useState<number>(0.00075);
  const [activeTab, setActiveTab] = useState<'basic' | 'rules' | 'schedule'>('basic');
  const [showExchangeRateModal, setShowExchangeRateModal] = useState(false);
  const [manualExchangeRate, setManualExchangeRate] = useState('');
  const [exchangeRateReason, setExchangeRateReason] = useState('');

  useEffect(() => {
    loadSettings();
    loadCurrentExchangeRate();
  }, []);

  const loadSettings = async () => {
    try {
      // Simulated API call
      setTimeout(() => {
        setSettings({
          mode: 'manual',
          autoSync: false,
          defaultMargin: 15,
          exchangeRateSource: 'api',
          roundingStrategy: 'nearest',
          syncSchedule: '0 */6 * * *'
        });
        setLoading(false);
      }, 1000);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setLoading(false);
    }
  };

  const loadCurrentExchangeRate = async () => {
    // Simulated API call
    setCurrentExchangeRate(0.00075);
  };

  const loadInitialPrices = async () => {
    setLoadingPrices(true);
    try {
      // Load products from both Shopify and Naver
      const [shopifyData, naverData] = await Promise.all([
        apiService.get('/products/search/shopify'),
        apiService.get('/products/search/naver')
      ]);

      // If we have data, process it
      const processedData: InitialPriceData[] = [];
      
      // For now, try to get mapped products or use mock data as fallback
      try {
        const mappedProducts = await apiService.get('/products');
        if (mappedProducts && mappedProducts.products && mappedProducts.products.length > 0) {
          // Process mapped products
          for (const product of mappedProducts.products) {
            processedData.push({
              sku: product.sku,
              productName: product.productName || 'Unknown Product',
              naverPrice: product.naverPrice || 0,
              currentShopifyPrice: product.shopifyPrice || 0,
              suggestedShopifyPrice: product.shopifyPrice ? product.shopifyPrice * 1.15 : 0,
              currentMargin: product.priceMargin || 1.15,
              suggestedMargin: 1.15,
              exchangeRate: currentExchangeRate
            });
          }
        }
      } catch (err) {
        console.log('No mapped products found, using default data');
      }

      // If no data, use mock data as fallback
      if (processedData.length === 0) {
        const mockData: InitialPriceData[] = [
          {
            sku: 'ALB001',
            productName: 'BTS - BE (Deluxe Edition)',
            naverPrice: 45000,
            currentShopifyPrice: 38.50,
            suggestedShopifyPrice: 38.81,
            currentMargin: 1.14,
            suggestedMargin: 1.15,
            exchangeRate: 0.00075
          },
          {
            sku: 'ALB002',
            productName: 'BLACKPINK - THE ALBUM',
            naverPrice: 38000,
            currentShopifyPrice: 32.00,
            suggestedShopifyPrice: 32.78,
            currentMargin: 1.12,
            suggestedMargin: 1.15,
            exchangeRate: 0.00075
          },
          {
            sku: 'ALB003',
            productName: 'Stray Kids - NOEASY',
            naverPrice: 42000,
            currentShopifyPrice: 35.50,
            suggestedShopifyPrice: 36.23,
            currentMargin: 1.13,
            suggestedMargin: 1.15,
            exchangeRate: 0.00075
          }
        ];
        setInitialPrices(mockData);
        
        // 자동으로 현재 마진율 입력
        const newEditingMargins = new Map<string, number>();
        mockData.forEach((item) => {
          newEditingMargins.set(item.sku, (item.currentMargin - 1) * 100);
        });
        setEditingMargins(newEditingMargins);
      } else {
        setInitialPrices(processedData);
        
        // 자동으로 현재 마진율 입력
        const newEditingMargins = new Map<string, number>();
        processedData.forEach((item) => {
          newEditingMargins.set(item.sku, (item.currentMargin - 1) * 100);
        });
        setEditingMargins(newEditingMargins);
      }
      
      setLoadingPrices(false);
    } catch (error) {
      console.error('Failed to load initial prices:', error);
      
      // Use mock data as fallback on error
      const mockData: InitialPriceData[] = [
        {
          sku: 'ALB001',
          productName: 'BTS - BE (Deluxe Edition)',
          naverPrice: 45000,
          currentShopifyPrice: 38.50,
          suggestedShopifyPrice: 38.81,
          currentMargin: 1.14,
          suggestedMargin: 1.15,
          exchangeRate: 0.00075
        },
        {
          sku: 'ALB002',
          productName: 'BLACKPINK - THE ALBUM',
          naverPrice: 38000,
          currentShopifyPrice: 32.00,
          suggestedShopifyPrice: 32.78,
          currentMargin: 1.12,
          suggestedMargin: 1.15,
          exchangeRate: 0.00075
        },
        {
          sku: 'ALB003',
          productName: 'Stray Kids - NOEASY',
          naverPrice: 42000,
          currentShopifyPrice: 35.50,
          suggestedShopifyPrice: 36.23,
          currentMargin: 1.13,
          suggestedMargin: 1.15,
          exchangeRate: 0.00075
        }
      ];
      
      setInitialPrices(mockData);
      
      // 자동으로 현재 마진율 입력
      const newEditingMargins = new Map<string, number>();
      mockData.forEach((item) => {
        newEditingMargins.set(item.sku, (item.currentMargin - 1) * 100);
      });
      setEditingMargins(newEditingMargins);
      
      setLoadingPrices(false);
    }
  };

  const calculateShopifyPrice = (naverPrice: number, marginPercent: number, exchangeRate: number) => {
    const margin = 1 + (marginPercent / 100);
    return (naverPrice * exchangeRate * margin).toFixed(2);
  };

  const handleModeChange = (mode: 'auto' | 'manual') => {
    setSettings({ ...settings, mode });
    if (mode === 'manual') {
      loadInitialPrices();
    }
  };

  const handleMarginChange = (sku: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      const newMargins = new Map(editingMargins);
      newMargins.set(sku, numValue);
      setEditingMargins(newMargins);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    // Simulated API call
    setTimeout(() => {
      setSaving(false);
      alert('설정이 저장되었습니다.');
    }, 1000);
  };

  const handleApplyMargins = async () => {
    // Simulated API call
    alert('마진이 적용되었습니다.');
    loadInitialPrices();
  };

  const toggleRowExpansion = (sku: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(sku)) {
      newExpanded.delete(sku);
    } else {
      newExpanded.add(sku);
    }
    setExpandedRows(newExpanded);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">가격 동기화 설정</h2>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('basic')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'basic'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Settings className="inline-block w-4 h-4 mr-2" />
                기본 설정
              </button>
              <button
                onClick={() => setActiveTab('rules')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'rules'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <TrendingUp className="inline-block w-4 h-4 mr-2" />
                마진 규칙
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'schedule'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Calendar className="inline-block w-4 h-4 mr-2" />
                스케줄 설정
              </button>
            </nav>
          </div>

          {/* Basic Settings Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              {/* Sync Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  동기화 모드
                </label>
                <div className="flex space-x-4">
                  <button
                    onClick={() => handleModeChange('auto')}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
                      settings.mode === 'auto'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <TrendingUp className="inline-block w-5 h-5 mr-2" />
                    자동 동기화
                  </button>
                  <button
                    onClick={() => handleModeChange('manual')}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
                      settings.mode === 'manual'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Edit2 className="inline-block w-5 h-5 mr-2" />
                    수동 설정
                  </button>
                </div>
              </div>

              {/* Settings Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    기본 마진율
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={settings.defaultMargin}
                      onChange={(e) => setSettings({ ...settings, defaultMargin: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <Percent className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    네이버 가격에서 Shopify 가격 계산 시 적용할 기본 마진율
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    반올림 전략
                  </label>
                  <select
                    value={settings.roundingStrategy}
                    onChange={(e) => setSettings({ ...settings, roundingStrategy: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="up">올림</option>
                    <option value="down">내림</option>
                    <option value="nearest">반올림</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    가격 계산 시 소수점 처리 방식
                  </p>
                </div>
              </div>

              {/* Exchange Rate Settings */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">환율 설정</h3>
                  <div className="flex items-center space-x-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      <DollarSign className="w-4 h-4 mr-1" />
                      현재 환율: 1 USD = ₩{(1/currentExchangeRate).toFixed(2)}
                    </span>
                    <button
                      onClick={() => setShowExchangeRateModal(true)}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      수동 설정
                    </button>
                  </div>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useApiRate"
                    checked={settings.exchangeRateSource === 'api'}
                    onChange={(e) => setSettings({
                      ...settings,
                      exchangeRateSource: e.target.checked ? 'api' : 'manual'
                    })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="useApiRate" className="ml-2 block text-sm text-gray-900">
                    실시간 환율 API 사용
                  </label>
                </div>
              </div>

              {/* Manual Price Setting */}
              {settings.mode === 'manual' && (
                <div className="mt-8">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900">상품별 마진 설정</h3>
                    <div className="flex space-x-3">
                      <button
                        onClick={loadInitialPrices}
                        disabled={loadingPrices}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${loadingPrices ? 'animate-spin' : ''}`} />
                        가격 불러오기
                      </button>
                      <button
                        onClick={handleApplyMargins}
                        disabled={initialPrices.length === 0}
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        마진 적용
                      </button>
                    </div>
                  </div>

                  {loadingPrices ? (
                    <div className="flex justify-center py-12">
                      <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
                    </div>
                  ) : initialPrices.length > 0 ? (
                    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                      <table className="min-w-full divide-y divide-gray-300">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                              
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                              SKU
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                              상품명
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                              네이버 가격
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                              현재 Shopify 가격
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                              현재 마진
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">
                              새 마진 설정
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                              예상 가격
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {initialPrices.map((item) => (
                            <React.Fragment key={item.sku}>
                              <tr>
                                <td className="whitespace-nowrap px-3 py-4 text-sm">
                                  <button
                                    onClick={() => toggleRowExpansion(item.sku)}
                                    className="text-gray-400 hover:text-gray-600"
                                  >
                                    {expandedRows.has(item.sku) ? (
                                      <ChevronUp className="w-5 h-5" />
                                    ) : (
                                      <ChevronDown className="w-5 h-5" />
                                    )}
                                  </button>
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">
                                  {item.sku}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                  {item.productName}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 text-right">
                                  ₩{item.naverPrice.toLocaleString()}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 text-right">
                                  ${item.currentShopifyPrice.toFixed(2)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-right">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    item.currentMargin >= 1.15 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {((item.currentMargin - 1) * 100).toFixed(1)}%
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                  <div className="relative">
                                    <input
                                      type="number"
                                      value={editingMargins.get(item.sku) || ((item.currentMargin - 1) * 100)}
                                      onChange={(e) => handleMarginChange(item.sku, e.target.value)}
                                      className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    <span className="absolute -right-6 top-1 text-gray-500">%</span>
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 text-right font-medium">
                                  ${calculateShopifyPrice(
                                    item.naverPrice,
                                    editingMargins.get(item.sku) || ((item.currentMargin - 1) * 100),
                                    item.exchangeRate
                                  )}
                                </td>
                              </tr>
                              {expandedRows.has(item.sku) && (
                                <tr>
                                  <td colSpan={8} className="px-3 py-4 bg-gray-50">
                                    <div className="grid grid-cols-4 gap-4 text-sm">
                                      <div>
                                        <span className="text-gray-500">환율:</span>
                                        <span className="ml-2 font-medium">1 USD = ₩{(1/item.exchangeRate).toFixed(2)}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">제안 마진:</span>
                                        <span className="ml-2 font-medium">{((item.suggestedMargin - 1) * 100).toFixed(1)}%</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">제안 가격:</span>
                                        <span className="ml-2 font-medium">${item.suggestedShopifyPrice.toFixed(2)}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">가격 차이:</span>
                                        <span className="ml-2 font-medium">
                                          ${(
                                            parseFloat(calculateShopifyPrice(
                                              item.naverPrice,
                                              editingMargins.get(item.sku) || ((item.currentMargin - 1) * 100),
                                              item.exchangeRate
                                            )) - item.currentShopifyPrice
                                          ).toFixed(2)}
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-gray-50 rounded-lg">
                      <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900">가격 정보가 없습니다</h3>
                      <p className="mt-1 text-sm text-gray-500">"가격 불러오기" 버튼을 클릭하여 현재 가격 정보를 불러오세요.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Rules Tab */}
          {activeTab === 'rules' && (
            <div className="py-4">
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">마진 규칙 설정</h3>
                <p className="mt-1 text-sm text-gray-500">카테고리, 브랜드, SKU별 개별 마진 규칙을 설정할 수 있습니다.</p>
                <button className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
                  규칙 추가
                </button>
              </div>
            </div>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="space-y-6">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="autoSync"
                  checked={settings.autoSync}
                  onChange={(e) => setSettings({ ...settings, autoSync: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="autoSync" className="ml-2 block text-sm text-gray-900">
                  자동 동기화 활성화
                </label>
              </div>

              {settings.autoSync && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    동기화 스케줄 (Cron 표현식)
                  </label>
                  <input
                    type="text"
                    value={settings.syncSchedule}
                    onChange={(e) => setSettings({ ...settings, syncSchedule: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0 */6 * * *"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    예: 0 */6 * * * (6시간마다), 0 0 * * * (매일 자정)
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Save Button */}
          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              설정 저장
            </button>
          </div>
        </div>
      </div>

      {/* Exchange Rate Modal */}
      {showExchangeRateModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">수동 환율 설정</h3>
            
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  현재 API 환율: 1 USD = ₩{(1/currentExchangeRate).toFixed(2)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  환율 (KRW → USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">1 KRW =</span>
                  <input
                    type="number"
                    value={manualExchangeRate}
                    onChange={(e) => setManualExchangeRate(e.target.value)}
                    className="w-full pl-20 pr-12 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00075"
                  />
                  <span className="absolute right-3 top-2 text-gray-500">USD</span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  예: 0.00075 (1 USD = 1,333 KRW)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  설정 사유
                </label>
                <textarea
                  value={exchangeRateReason}
                  onChange={(e) => setExchangeRateReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="환율을 수동으로 설정하는 이유를 입력하세요"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowExchangeRateModal(false);
                  setManualExchangeRate('');
                  setExchangeRateReason('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={() => {
                  // Handle save
                  setShowExchangeRateModal(false);
                  alert('환율이 설정되었습니다.');
                }}
                disabled={!manualExchangeRate || !exchangeRateReason}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                설정
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceSyncSettings;