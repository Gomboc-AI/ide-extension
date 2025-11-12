import logger from './logger';

export interface DiffAnalysis {
  resourceType?: string;
  resourceName?: string;
  changeType?: string;
  propertyName?: string;
  properties?: string[];
  description: string;
}

/**
 * Utility class for analyzing diff content to extract meaningful information
 */
export class DiffContentAnalyzer {
  /**
   * Analyze diff content to extract resource and change information
   */
  static analyzeDiffContent(diff: {
    newLines: string[];
    type: 'ADD' | 'UPDATE' | 'DELETE';
    targetLine: number;
  }): DiffAnalysis {
    const content = diff.newLines.join('\n');

    // Try to extract resource information
    const resourceInfo = this.extractResourceInfo(content);

    // Try to extract change type and property
    const changeInfo = this.extractChangeInfo(content, diff.type);

    // Extract all properties mentioned in the diff (handles TF/Cfn/JSON)
    const properties = this.extractAllProperties(content);

    // Generate description
    const description = this.generateDescription(
      resourceInfo,
      changeInfo,
      diff,
      properties,
    );

    logger.info('Analyzed diff content', {
      content: content.slice(0, 100), // just limiting the log size
      resourceInfo,
      changeInfo,
      properties,
      description,
    });

    return {
      ...resourceInfo,
      ...changeInfo,
      properties,
      description,
    };
  }

  /**
   * Extract resource type and name from diff content
   */
  private static extractResourceInfo(content: string): {
    resourceType?: string;
    resourceName?: string;
  } {
    // Look for Terraform resource definitions
    const resourceMatch = content.match(/resource\s+"([^"]+)"\s+"([^"]+)"/);
    if (resourceMatch) {
      return {
        resourceType: resourceMatch[1],
        resourceName: resourceMatch[2],
      };
    }

    // Look for CloudFormation resource definitions
    const cfnMatch = content.match(/^(\w+):\s*$/m);
    if (cfnMatch) {
      return {
        resourceType: cfnMatch[1],
        resourceName: cfnMatch[1], // Use type as name for CFN
      };
    }

    // Look for AWS resource types in property values
    const awsTypeMatch = content.match(/(aws_\w+)/);
    if (awsTypeMatch) {
      return {
        resourceType: awsTypeMatch[1],
      };
    }

    return {};
  }

  /**
   * Extract change type and property information
   */
  private static extractChangeInfo(
    content: string,
    diffType: string,
  ): {
    changeType?: string;
    propertyName?: string;
  } {
    // Look for block additions first (block_name {)
    const blockMatch = content.match(/(\w+)\s*{/);
    if (blockMatch) {
      return {
        changeType: `Add ${blockMatch[1]} block`,
        propertyName: blockMatch[1],
      };
    }

    // Look for property assignments (key = value)
    const propertyMatch = content.match(/(\w+)\s*=/);
    if (propertyMatch) {
      return {
        changeType: `Set ${propertyMatch[1]}`,
        propertyName: propertyMatch[1],
      };
    }

    // Look for any word that might be a property or configuration, not really sure what the best thing we can do is
    const wordMatch = content.match(/\b(\w+)\b/);
    if (wordMatch) {
      return {
        changeType:
          diffType === 'ADD'
            ? 'Add configuration'
            : diffType === 'UPDATE'
              ? 'Update configuration'
              : 'Remove configuration',
        propertyName: wordMatch[1],
      };
    }

    return {
      changeType:
        diffType === 'ADD'
          ? 'Add configuration'
          : diffType === 'UPDATE'
            ? 'Update configuration'
            : 'Remove configuration',
    };
  }

  /**
   * Extract all property names present in the diff content.
   * Supports:
   * - Terraform:   key = value
   * - YAML/CFN:    key:
   * - JSON:        "key":
   */
  private static extractAllProperties(content: string): string[] {
    const properties = new Set<string>();
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
        continue;
      }
      // Skip resource headers and braces
      if (
        /^resource\s+"[^"]+"\s+"[^"]+"\s*\{/.test(trimmed) ||
        trimmed === '{' ||
        trimmed === '}' ||
        trimmed.endsWith('{')
      ) {
        continue;
      }

      // Terraform style: key = value
      const tfMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (tfMatch) {
        properties.add(tfMatch[1]);
        continue;
      }

      // YAML/CFN style: key:
      const yamlMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (yamlMatch) {
        properties.add(yamlMatch[1]);
        continue;
      }

      // JSON style: "key":
      const jsonMatch = trimmed.match(/^"([^"]+)"\s*:/);
      if (jsonMatch) {
        properties.add(jsonMatch[1]);
        continue;
      }
    }

    return Array.from(properties);
  }

  /**
   * Generate a human-readable description
   */
  private static generateDescription(
    resourceInfo: { resourceType?: string; resourceName?: string },
    changeInfo: { changeType?: string; propertyName?: string },
    diff: { targetLine: number; newLines: string[] },
    properties?: string[],
  ): string {
    const { resourceType, resourceName } = resourceInfo;
    const { changeType, propertyName } = changeInfo;

    // Build resource identifier
    let resourceIdentifier = '';
    if (resourceType && resourceName) {
      resourceIdentifier = `${resourceType} "${resourceName}"`;
    } else if (resourceType) {
      resourceIdentifier = resourceType;
    } else {
      resourceIdentifier = 'resource';
    }

    // If we have a list of properties, prefer using that to surface all changes
    const props = Array.isArray(properties) ? properties.filter(Boolean) : [];
    if (props.length > 0) {
      const propsList =
        props.length > 5 ? `${props.slice(0, 5).join(', ')}, ...` : props.join(', ');
      // Keep verb generic so it fits ADD/UPDATE; the context (quick fix) explains it's a remediation
      return `Update ${resourceIdentifier} properties: ${propsList}`;
    }

    // Fallback: Use the actual content for more specific descriptions
    const content = diff.newLines.join(' ').trim();

    // If we have specific change info, use it
    if (changeType && propertyName) {
      return `${changeType} for ${resourceIdentifier}`;
    }

    // Otherwise, use the actual content
    if (content.length > 0) {
      // Truncate long content
      const truncatedContent =
        content.length > 50 ? content.substring(0, 50) + '...' : content;
      return `Apply change: ${truncatedContent} at line ${diff.targetLine}`;
    }

    // Fallback
    return `Apply security fix for ${resourceIdentifier} at line ${diff.targetLine}`;
  }
}
