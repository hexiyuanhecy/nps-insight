/**
 * 公式同步模块
 * 用于同步系统存储的排序公式与多维表格中的公式
 */

import { StorageAdapter, TABLES } from '../storage/base-storage';
import { getDefaultStorage } from '../adapter-factory';
import { SortWeights } from './top-issues';
import { ANALYSIS_FIELDS } from '../feishu/constants';

/**
 * 公式同步类
 */
export class FormulaSync {
  private storage: StorageAdapter;
  private formulaKey: string;

  constructor(storage?: StorageAdapter) {
    this.storage = storage || getDefaultStorage();
    this.formulaKey = 'TOP_ISSUE_FORMULA';
  }

  /**
   * 执行公式同步
   * 在 Top 问题表中查找 compositeScore 字段的公式
   */
  async sync(): Promise<void> {
    console.log('[公式同步] 开始公式同步');
    
    try {
      // 读取系统存储的公式
      const systemFormula = await this.getSystemFormula();
      console.log('[公式同步] 系统公式:', systemFormula);
      
      // 读取多维表格中综合评分字段的公式
      const tableFormula = await this.getTableFormula();
      console.log('[公式同步] 表格公式:', tableFormula);
      
      // 对比差异，以用户调整为准
      if (tableFormula && tableFormula !== systemFormula) {
        console.log('[公式同步] 发现差异，以表格公式为准');
        
        // 更新系统存储的公式
        await this.updateSystemFormula(tableFormula);
        
        // 解析新公式，更新权重配置
        const weights = this.parseFormula(tableFormula);
        await this.updateWeights(weights);
        
        console.log('[公式同步] 公式同步完成');
      } else {
        console.log('[公式同步] 公式一致，无需同步');
      }
    } catch (error) {
      console.error('[公式同步] 同步失败:', error);
      throw error;
    }
  }

  /**
   * 获取系统存储的公式
   */
  async getSystemFormula(): Promise<string> {
    try {
      const configRecords = await this.storage.searchRecords(
        TABLES.CONFIG,
        'key',
        this.formulaKey
      );
      
      if (configRecords.length > 0) {
        return String(configRecords[0].fields.value || '');
      }
      
      return this.getDefaultFormula();
    } catch (error) {
      console.error('[公式同步] 获取系统公式失败:', error);
      return this.getDefaultFormula();
    }
  }

  /**
   * 获取默认公式
   * 使用新的字段名（totalCount、largeTenantRatio、avgScore）
   */
  private getDefaultFormula(): string {
    return '(totalCount * 0.5) + (largeTenantRatio * 0.3) + ((10 - avgScore) * 0.2)';
  }

  /**
   * 获取多维表格中综合评分字段的公式
   * 通过 API 获取字段的公式属性，使用新的字段定义常量
   */
  async getTableFormula(): Promise<string | null> {
    try {
      // 获取 Top问题表的字段列表
      const fields = await this.storage.getTableFields(TABLES.TOP_ISSUES);
      
      // 查找综合评分字段（使用常量定义的中文字段名）
      const compositeField = fields.find(
        f => f.field_name === ANALYSIS_FIELDS.COMPOSITE_SCORE
      );
      
      if (compositeField) {
        // 飞书多维表格中，公式字段的 property.formula 包含公式内容
        // 飞书API返回的字段信息中，type=15 表示公式字段
        // 需要通过单独的字段详情API获取完整的公式属性
        
        // 尝试从字段信息中直接获取公式
        // 如果字段信息中包含公式，直接返回
        if ('property' in compositeField && compositeField.property) {
          const formula = (compositeField.property as Record<string, unknown>).formula;
          if (formula) {
            return String(formula);
          }
        }
        
        // 如果字段信息不包含公式，说明需要通过字段详情API获取
        // 这里返回 null，由调用方处理（使用系统默认公式）
        console.log('[公式同步] 字段信息中未包含公式，使用系统默认公式');
      }
      
      return null;
    } catch (error) {
      console.error('[公式同步] 获取表格公式失败:', error);
      return null;
    }
  }

  /**
   * 更新系统存储的公式
   */
  async updateSystemFormula(formula: string): Promise<void> {
    try {
      const configRecords = await this.storage.searchRecords(
        TABLES.CONFIG,
        'key',
        this.formulaKey
      );
      
      if (configRecords.length > 0) {
        await this.storage.updateRecord(TABLES.CONFIG, configRecords[0].record_id, {
          value: formula,
        });
      } else {
        await this.storage.createRecord(TABLES.CONFIG, {
          key: this.formulaKey,
          value: formula,
        });
      }
      
      console.log('[公式同步] 系统公式已更新');
    } catch (error) {
      console.error('[公式同步] 更新系统公式失败:', error);
      throw error;
    }
  }

  /**
   * 解析公式，提取权重
   * 支持解析新的字段名（totalCount 代替 count）
   */
  private parseFormula(formula: string): SortWeights {
    const weights: SortWeights = { count: 0.5, largeTenant: 0.3, quality: 0.2 };
    
    try {
      // 解析 totalCount 权重（兼容旧的 count 字段名）
      const totalCountMatch = formula.match(/totalCount\s*\*\s*([\d.]+)/i);
      const countMatch = formula.match(/\bcount\s*\*\s*([\d.]+)/i);
      
      if (totalCountMatch) {
        weights.count = parseFloat(totalCountMatch[1]);
      } else if (countMatch) {
        weights.count = parseFloat(countMatch[1]);
      }
      
      // 解析 largeTenantRatio 权重
      const largeTenantMatch = formula.match(/largeTenantRatio\s*\*\s*([\d.]+)/i);
      if (largeTenantMatch) {
        weights.largeTenant = parseFloat(largeTenantMatch[1]);
      }
      
      // 解析 avgScore 权重（注意：公式中是 (10 - avgScore)）
      const avgScoreMatch = formula.match(/avgScore\s*\*\s*([\d.]+)/i);
      if (avgScoreMatch) {
        weights.quality = parseFloat(avgScoreMatch[1]);
      } else {
        const qualityMatch = formula.match(/\(10\s*-\s*avgScore\)\s*\*\s*([\d.]+)/i);
        if (qualityMatch) {
          weights.quality = parseFloat(qualityMatch[1]);
        }
      }
      
      console.log('[公式同步] 解析权重:', weights);
    } catch (error) {
      console.error('[公式同步] 解析公式失败:', error);
    }
    
    return weights;
  }

  /**
   * 更新权重配置
   * 确保权重配置正确写入系统配置
   */
  async updateWeights(weights: SortWeights): Promise<void> {
    try {
      const weightsKey = 'TOP_ISSUE_WEIGHTS';
      
      const configRecords = await this.storage.searchRecords(
        TABLES.CONFIG,
        'key',
        weightsKey
      );
      
      const weightsValue = JSON.stringify(weights);
      
      if (configRecords.length > 0) {
        await this.storage.updateRecord(TABLES.CONFIG, configRecords[0].record_id, {
          value: weightsValue,
        });
      } else {
        await this.storage.createRecord(TABLES.CONFIG, {
          key: weightsKey,
          value: weightsValue,
        });
      }
      
      console.log('[公式同步] 权重配置已更新');
    } catch (error) {
      console.error('[公式同步] 更新权重配置失败:', error);
      throw error;
    }
  }

  /**
   * 获取当前权重配置
   */
  async getWeights(): Promise<SortWeights> {
    try {
      const weightsKey = 'TOP_ISSUE_WEIGHTS';
      
      const configRecords = await this.storage.searchRecords(
        TABLES.CONFIG,
        'key',
        weightsKey
      );
      
      if (configRecords.length > 0) {
        const value = String(configRecords[0].fields.value || '');
        return JSON.parse(value);
      }
      
      return { count: 0.5, largeTenant: 0.3, quality: 0.2 };
    } catch (error) {
      console.error('[公式同步] 获取权重配置失败:', error);
      return { count: 0.5, largeTenant: 0.3, quality: 0.2 };
    }
  }
}