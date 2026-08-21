import db from '../database/connection';
import logger from '../utils/logger';

/**
 * Sales Predictions Service
 *
 * Provides AI-based ticket sales predictions using statistical methods:
 * - Historical sales data from similar concerts (same venue type, concert type, time of year)
 * - Days until concert
 * - Current sales velocity
 * - Linear regression for trend prediction
 * - Seasonal adjustments
 */

export interface SalesPrediction {
  predictedTotalSales: number;
  predictedRevenue: number;
  confidenceLevel: 'low' | 'medium' | 'high';
  factors: string[];
  dailyPredictions: { date: string; predictedSales: number }[];
}

export interface PricingSuggestion {
  currentPrice: number;
  suggestedPrice: number;
  priceRange: { min: number; max: number };
  demandLevel: 'low' | 'medium' | 'high';
  reasoning: string[];
}

interface HistoricalConcertData {
  id: string;
  name: string;
  date: string;
  venue_type: string | null;
  concert_type: string | null;
  total_capacity: number;
  total_sold: number;
  total_revenue: number;
  days_before_sale_start: number;
}

interface DailySalesData {
  date: string;
  sales_count: number;
  cumulative_sales: number;
}

interface TicketTypeInfo {
  id: string;
  name: string;
  price: number;
  quantity: number;
  sold: number;
  sale_start: string | null;
  sale_end: string | null;
}

interface ConcertInfo {
  id: string;
  name: string;
  date: string;
  venue_type: string | null;
  concert_type: string | null;
  association_id: string;
}

/**
 * Get the month number (1-12) from a date string
 */
function getMonth(dateStr: string): number {
  return new Date(dateStr).getMonth() + 1;
}

/**
 * Calculate the season based on month
 */
function getSeason(month: number): 'winter' | 'spring' | 'summer' | 'fall' {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

/**
 * Calculate seasonal adjustment factor based on historical data
 */
function getSeasonalFactor(targetMonth: number, historicalData: HistoricalConcertData[]): number {
  if (historicalData.length === 0) return 1.0;

  const targetSeason = getSeason(targetMonth);
  const seasonSales: Record<string, { total: number; count: number }> = {
    winter: { total: 0, count: 0 },
    spring: { total: 0, count: 0 },
    summer: { total: 0, count: 0 },
    fall: { total: 0, count: 0 },
  };

  historicalData.forEach((concert) => {
    const month = getMonth(concert.date);
    const season = getSeason(month);
    const fillRate = concert.total_capacity > 0 ? concert.total_sold / concert.total_capacity : 0;
    seasonSales[season].total += fillRate;
    seasonSales[season].count += 1;
  });

  // Calculate average fill rate for each season
  const seasonAverages: Record<string, number> = {};
  let totalAvg = 0;
  let seasonCount = 0;

  Object.entries(seasonSales).forEach(([season, data]) => {
    if (data.count > 0) {
      seasonAverages[season] = data.total / data.count;
      totalAvg += seasonAverages[season];
      seasonCount += 1;
    }
  });

  if (seasonCount === 0) return 1.0;
  const overallAvg = totalAvg / seasonCount;

  // Return factor for target season (1.0 means average)
  const targetAvg = seasonAverages[targetSeason] || overallAvg;
  return overallAvg > 0 ? targetAvg / overallAvg : 1.0;
}

/**
 * Calculate linear regression coefficients for trend prediction
 */
function linearRegression(data: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
  if (data.length < 2) {
    return { slope: 0, intercept: data[0]?.y || 0, r2: 0 };
  }

  const n = data.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0,
    sumY2 = 0;

  data.forEach((point) => {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumX2 += point.x * point.x;
    sumY2 += point.y * point.y;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const yMean = sumY / n;
  let ssTotal = 0,
    ssResidual = 0;
  data.forEach((point) => {
    ssTotal += (point.y - yMean) ** 2;
    const predicted = slope * point.x + intercept;
    ssResidual += (point.y - predicted) ** 2;
  });
  const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { slope: isNaN(slope) ? 0 : slope, intercept: isNaN(intercept) ? 0 : intercept, r2 };
}

/**
 * Get historical concert data for similar concerts
 */
function getHistoricalData(
  associationId: string,
  concertType?: string | null,
  venueType?: string | null,
): HistoricalConcertData[] {
  let query = `
        SELECT
            c.id,
            c.name,
            c.date,
            c.venue_type,
            c.concert_type,
            COALESCE(SUM(tt.quantity), 0) as total_capacity,
            COALESCE(SUM(tt.sold), 0) as total_sold,
            COALESCE(SUM(tt.sold * tt.price), 0) as total_revenue,
            CAST(julianday(c.date) - julianday(MIN(tt.sale_start)) AS INTEGER) as days_before_sale_start
        FROM concerts c
        LEFT JOIN ticket_types tt ON c.id = tt.concert_id
        WHERE c.association_id = ?
        AND c.deleted_at IS NULL
        AND c.date < date('now')
    `;
  const params: (string | null)[] = [associationId];

  // Filter by similar concert type if available
  if (concertType) {
    query += ' AND c.concert_type = ?';
    params.push(concertType);
  }

  // Filter by similar venue type if available
  if (venueType) {
    query += ' AND c.venue_type = ?';
    params.push(venueType);
  }

  query += `
        GROUP BY c.id, c.name, c.date, c.venue_type, c.concert_type
        HAVING total_capacity > 0
        ORDER BY c.date DESC
        LIMIT 20
    `;

  try {
    return db.prepare(query).all(...params) as HistoricalConcertData[];
  } catch (error) {
    logger.error('Error fetching historical concert data:', error);
    return [];
  }
}

/**
 * Get daily sales data for a concert
 */
function getDailySalesData(concertId: string): DailySalesData[] {
  try {
    const query = `
            SELECT
                DATE(t.created_at) as date,
                COUNT(*) as sales_count
            FROM tickets t
            JOIN ticket_orders o ON t.order_id = o.id
            WHERE o.concert_id = ?
            AND o.status = 'paid'
            GROUP BY DATE(t.created_at)
            ORDER BY date ASC
        `;

    const dailyData = db.prepare(query).all(concertId) as { date: string; sales_count: number }[];

    // Calculate cumulative sales
    let cumulative = 0;
    return dailyData.map((day) => {
      cumulative += day.sales_count;
      return {
        date: day.date,
        sales_count: day.sales_count,
        cumulative_sales: cumulative,
      };
    });
  } catch (error) {
    logger.error('Error fetching daily sales data:', error);
    return [];
  }
}

/**
 * Get concert info
 */
function getConcertInfo(concertId: string): ConcertInfo | null {
  try {
    return db
      .prepare(
        `
            SELECT id, name, date, venue_type, concert_type, association_id
            FROM concerts
            WHERE id = ?
        `,
      )
      .get(concertId) as ConcertInfo | null;
  } catch (error) {
    logger.error('Error fetching concert info:', error);
    return null;
  }
}

/**
 * Get ticket type info for a concert
 */
function getTicketTypes(concertId: string): TicketTypeInfo[] {
  try {
    return db
      .prepare(
        `
            SELECT id, name, price, quantity, sold, sale_start, sale_end
            FROM ticket_types
            WHERE concert_id = ?
        `,
      )
      .all(concertId) as TicketTypeInfo[];
  } catch (error) {
    logger.error('Error fetching ticket types:', error);
    return [];
  }
}

/**
 * Predict ticket sales for a concert
 */
export function predictTicketSales(concertId: string): SalesPrediction {
  const factors: string[] = [];

  // Get concert info
  const concert = getConcertInfo(concertId);
  if (!concert) {
    return {
      predictedTotalSales: 0,
      predictedRevenue: 0,
      confidenceLevel: 'low',
      factors: ['Concert not found'],
      dailyPredictions: [],
    };
  }

  // Get ticket types
  const ticketTypes = getTicketTypes(concertId);
  if (ticketTypes.length === 0) {
    return {
      predictedTotalSales: 0,
      predictedRevenue: 0,
      confidenceLevel: 'low',
      factors: ['No ticket types defined'],
      dailyPredictions: [],
    };
  }

  // Calculate current stats
  const totalCapacity = ticketTypes.reduce((sum, tt) => sum + tt.quantity, 0);
  const currentSold = ticketTypes.reduce((sum, tt) => sum + tt.sold, 0);
  const currentRevenue = ticketTypes.reduce((sum, tt) => sum + tt.sold * tt.price, 0);
  const avgPrice =
    totalCapacity > 0 ? ticketTypes.reduce((sum, tt) => sum + tt.price * tt.quantity, 0) / totalCapacity : 0;

  // Days until concert
  const today = new Date();
  const concertDate = new Date(concert.date);
  const daysUntilConcert = Math.max(0, Math.ceil((concertDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  factors.push(`Days until concert: ${daysUntilConcert}`);
  // Zonder plaatsen is currentSold/totalCapacity 0/0; dat is NaN, en dat kwam
  // zo in de onderbouwing terecht ("0/0 (NaN%)").
  const currentFillPercentage = totalCapacity > 0 ? Math.round((currentSold / totalCapacity) * 100) : 0;
  factors.push(`Current sales: ${currentSold}/${totalCapacity} (${currentFillPercentage}%)`);

  // Get historical data
  const historicalData = getHistoricalData(concert.association_id, concert.concert_type, concert.venue_type);

  // Get similar concerts without strict filtering if needed
  let allHistoricalData = historicalData;
  if (historicalData.length < 3) {
    allHistoricalData = getHistoricalData(concert.association_id);
    if (historicalData.length === 0) {
      factors.push('Limited historical data available');
    } else {
      factors.push(
        `Using ${historicalData.length} similar concerts and ${allHistoricalData.length - historicalData.length} other concerts for prediction`,
      );
    }
  } else {
    factors.push(`Based on ${historicalData.length} similar past concerts`);
  }

  // Calculate historical fill rate average
  let historicalFillRate = 0.7; // Default 70%
  if (allHistoricalData.length > 0) {
    const totalFillRate = allHistoricalData.reduce((sum, c) => {
      return sum + (c.total_capacity > 0 ? c.total_sold / c.total_capacity : 0);
    }, 0);
    historicalFillRate = totalFillRate / allHistoricalData.length;
    factors.push(`Historical average fill rate: ${Math.round(historicalFillRate * 100)}%`);
  }

  // Get daily sales data for trend analysis
  const dailySales = getDailySalesData(concertId);
  let salesVelocity = 0;
  let trendPrediction = 0;

  if (dailySales.length >= 3) {
    // Calculate recent sales velocity (sales per day over last 7 days)
    const recentDays = dailySales.slice(-7);
    const recentTotal = recentDays.reduce((sum, d) => sum + d.sales_count, 0);
    salesVelocity = recentTotal / Math.min(7, recentDays.length);
    factors.push(`Current sales velocity: ${salesVelocity.toFixed(1)} tickets/day`);

    // Linear regression on cumulative sales
    const regressionData = dailySales.map((d, i) => ({ x: i, y: d.cumulative_sales }));
    const regression = linearRegression(regressionData);

    // Predict final sales based on trend
    const daysElapsed = dailySales.length;
    const totalSalesPeriod = daysElapsed + daysUntilConcert;
    trendPrediction = regression.slope * totalSalesPeriod + regression.intercept;

    if (regression.r2 > 0.7) {
      factors.push(`Strong sales trend detected (R2: ${regression.r2.toFixed(2)})`);
    } else if (regression.r2 > 0.4) {
      factors.push(`Moderate sales trend (R2: ${regression.r2.toFixed(2)})`);
    }
  }

  // Apply seasonal adjustment
  const targetMonth = getMonth(concert.date);
  const seasonalFactor = getSeasonalFactor(targetMonth, allHistoricalData);
  if (seasonalFactor > 1.1) {
    factors.push(`High season: ${Math.round((seasonalFactor - 1) * 100)}% above average`);
  } else if (seasonalFactor < 0.9) {
    factors.push(`Low season: ${Math.round((1 - seasonalFactor) * 100)}% below average`);
  }

  // Combine predictions using weighted average
  // Method 1: Historical fill rate * capacity
  const historicalPrediction = totalCapacity * historicalFillRate * seasonalFactor;

  // Method 2: Current sales + velocity * remaining days
  const velocityPrediction = currentSold + salesVelocity * daysUntilConcert;

  // Method 3: Trend-based prediction
  const trendBasedPrediction = trendPrediction > 0 ? trendPrediction : historicalPrediction;

  // Weight based on data quality
  let weights = { historical: 0.4, velocity: 0.3, trend: 0.3 };
  if (dailySales.length < 3) {
    weights = { historical: 0.8, velocity: 0.1, trend: 0.1 };
  } else if (dailySales.length < 7) {
    weights = { historical: 0.5, velocity: 0.25, trend: 0.25 };
  }

  let predictedSales =
    weights.historical * historicalPrediction +
    weights.velocity * velocityPrediction +
    weights.trend * trendBasedPrediction;

  // Ensure prediction is within reasonable bounds
  predictedSales = Math.max(currentSold, Math.min(totalCapacity, predictedSales));
  predictedSales = Math.round(predictedSales);

  // Calculate predicted revenue
  const predictedRevenue = Math.round(predictedSales * avgPrice);

  // Determine confidence level
  let confidenceLevel: 'low' | 'medium' | 'high' = 'low';
  if (allHistoricalData.length >= 5 && dailySales.length >= 7) {
    confidenceLevel = 'high';
  } else if (allHistoricalData.length >= 3 || dailySales.length >= 5) {
    confidenceLevel = 'medium';
  }

  // Generate daily predictions
  const dailyPredictions: { date: string; predictedSales: number }[] = [];
  const remainingSales = predictedSales - currentSold;
  const dailyIncrement = daysUntilConcert > 0 ? remainingSales / daysUntilConcert : 0;

  let cumulativePredicted = currentSold;
  for (let i = 1; i <= Math.min(daysUntilConcert, 30); i++) {
    const predictionDate = new Date(today);
    predictionDate.setDate(predictionDate.getDate() + i);

    // Apply slight acceleration near concert date
    const accelerationFactor = 1 + (i / daysUntilConcert) * 0.5;
    cumulativePredicted += dailyIncrement * accelerationFactor;

    dailyPredictions.push({
      date: predictionDate.toISOString().split('T')[0],
      predictedSales: Math.min(Math.round(cumulativePredicted), totalCapacity),
    });
  }

  return {
    predictedTotalSales: predictedSales,
    predictedRevenue,
    confidenceLevel,
    factors,
    dailyPredictions,
  };
}

/**
 * Calculate optimal pricing suggestion
 */
export function calculateOptimalPricing(concertId: string): PricingSuggestion {
  const reasoning: string[] = [];

  // Get concert info
  const concert = getConcertInfo(concertId);
  if (!concert) {
    return {
      currentPrice: 0,
      suggestedPrice: 0,
      priceRange: { min: 0, max: 0 },
      demandLevel: 'low',
      reasoning: ['Concert not found'],
    };
  }

  // Get ticket types
  const ticketTypes = getTicketTypes(concertId);
  if (ticketTypes.length === 0) {
    return {
      currentPrice: 0,
      suggestedPrice: 0,
      priceRange: { min: 0, max: 0 },
      demandLevel: 'low',
      reasoning: ['No ticket types defined'],
    };
  }

  // Calculate current stats
  const totalCapacity = ticketTypes.reduce((sum, tt) => sum + tt.quantity, 0);
  const currentSold = ticketTypes.reduce((sum, tt) => sum + tt.sold, 0);
  const currentFillRate = totalCapacity > 0 ? currentSold / totalCapacity : 0;
  const avgCurrentPrice =
    totalCapacity > 0 ? ticketTypes.reduce((sum, tt) => sum + tt.price * tt.quantity, 0) / totalCapacity : 0;

  // Get historical data for pricing analysis
  const historicalData = getHistoricalData(concert.association_id, concert.concert_type, concert.venue_type);

  // Calculate historical price-fill rate relationship (only used for reasoning output)
  if (historicalData.length > 0) {
    const historicalAvgPrice =
      historicalData.reduce((sum, c) => {
        // De deler is total_sold, dus daar moet ook op gecontroleerd worden.
        // De HAVING-clausule garandeert alleen dat er plaatsen waren; een
        // afgelopen concert dat niets verkocht gaf hier 0/0 = NaN, en die NaN
        // besmette het hele gemiddelde.
        return sum + (c.total_sold > 0 ? c.total_revenue / c.total_sold : 0);
      }, 0) / historicalData.length;

    const historicalFillRate =
      historicalData.reduce((sum, c) => {
        return sum + (c.total_capacity > 0 ? c.total_sold / c.total_capacity : 0);
      }, 0) / historicalData.length;

    reasoning.push(`Historical average price: EUR ${historicalAvgPrice.toFixed(2)}`);
    reasoning.push(`Historical fill rate: ${Math.round(historicalFillRate * 100)}%`);
  }

  // Days until concert
  const concertDate = new Date(concert.date);
  const today = new Date();
  const daysUntilConcert = Math.max(0, Math.ceil((concertDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  // Determine demand level based on sales velocity
  let demandLevel: 'low' | 'medium' | 'high' = 'medium';

  if (currentFillRate > 0.8) {
    demandLevel = 'high';
    reasoning.push('High demand: Over 80% sold');
  } else if (currentFillRate < 0.3 && daysUntilConcert < 14) {
    demandLevel = 'low';
    reasoning.push('Low demand: Under 30% sold with less than 2 weeks to go');
  } else if (currentFillRate > 0.5 && daysUntilConcert > 30) {
    demandLevel = 'high';
    reasoning.push('Strong early sales: Over 50% sold with more than a month to go');
  } else {
    reasoning.push(`Moderate demand: ${Math.round(currentFillRate * 100)}% sold`);
  }

  // Calculate price elasticity estimate
  // Simplified: assume 10% price change = 5% demand change (elasticity = 0.5)
  const elasticity = 0.5;

  // Determine optimal price adjustment
  let priceAdjustment = 0;

  if (demandLevel === 'high') {
    // High demand - can increase price
    const targetFillRate = 0.9;
    const excessDemand = currentFillRate - targetFillRate + 0.1;
    priceAdjustment = (excessDemand / elasticity) * avgCurrentPrice * 0.5; // Conservative increase
    reasoning.push('Consider increasing price due to high demand');
  } else if (demandLevel === 'low') {
    // Low demand - consider decreasing price
    const targetFillRate = 0.6;
    const demandShortfall = targetFillRate - currentFillRate;
    priceAdjustment = (-demandShortfall / elasticity) * avgCurrentPrice * 0.3; // Conservative decrease
    reasoning.push('Consider decreasing price to boost sales');
  }

  // Apply time-based adjustment
  if (daysUntilConcert < 7 && currentFillRate < 0.7) {
    priceAdjustment = Math.min(priceAdjustment, -avgCurrentPrice * 0.1);
    reasoning.push('Last-minute pricing: consider additional discount');
  }

  const suggestedPrice = Math.round((avgCurrentPrice + priceAdjustment) * 100) / 100;

  // Calculate price range
  const priceRange = {
    min: Math.round(avgCurrentPrice * 0.7 * 100) / 100,
    max: Math.round(avgCurrentPrice * 1.3 * 100) / 100,
  };

  return {
    currentPrice: Math.round(avgCurrentPrice * 100) / 100,
    suggestedPrice: Math.max(priceRange.min, Math.min(priceRange.max, suggestedPrice)),
    priceRange,
    demandLevel,
    reasoning,
  };
}

/**
 * Get sales prediction summary for admin dashboard
 */
export function getSalesPredictionSummary(concertId: string): {
  prediction: SalesPrediction;
  pricing: PricingSuggestion;
  currentStats: {
    totalCapacity: number;
    totalSold: number;
    currentRevenue: number;
    fillRate: number;
    daysUntilConcert: number;
  };
} {
  const prediction = predictTicketSales(concertId);
  const pricing = calculateOptimalPricing(concertId);

  // Get current stats
  const concert = getConcertInfo(concertId);
  const ticketTypes = getTicketTypes(concertId);

  const totalCapacity = ticketTypes.reduce((sum, tt) => sum + tt.quantity, 0);
  const totalSold = ticketTypes.reduce((sum, tt) => sum + tt.sold, 0);
  const currentRevenue = ticketTypes.reduce((sum, tt) => sum + tt.sold * tt.price, 0);
  const fillRate = totalCapacity > 0 ? totalSold / totalCapacity : 0;

  const today = new Date();
  const concertDate = concert ? new Date(concert.date) : today;
  const daysUntilConcert = Math.max(0, Math.ceil((concertDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    prediction,
    pricing,
    currentStats: {
      totalCapacity,
      totalSold,
      currentRevenue,
      fillRate: Math.round(fillRate * 100) / 100,
      daysUntilConcert,
    },
  };
}

export default {
  predictTicketSales,
  calculateOptimalPricing,
  getSalesPredictionSummary,
};
