import { MavenXMLLanguageHandler } from './handler';

const mavenXml = [
  '<project>',
  '  <groupId>com.example</groupId>',
  '  <artifactId>service</artifactId>',
  '  <dependencies>',
  '    <dependency>',
  '      <groupId>org.slf4j</groupId>',
  '      <artifactId>slf4j-api</artifactId>',
  '    </dependency>',
  '  </dependencies>',
  '</project>',
].join('\n');

describe('MavenXMLLanguageHandler', () => {
  const handler = new MavenXMLLanguageHandler();

  it('returns maven xml document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/pom.xml',
        content: mavenXml,
      }),
    ).toMatchObject({
      languageId: 'maven-xml',
      fileName: 'pom.xml',
      extension: '.xml',
    });
  });

  it('parses dependency + project blocks with stable headers', () => {
    const blocks = handler.listBlocks({
      filePath: '/workspace/pom.xml',
      content: mavenXml,
    });
    expect(blocks.find(block => block.type === 'maven_dependency')?.name).toBe(
      'org.slf4j:slf4j-api',
    );
    expect(blocks.find(block => block.type === 'maven_project')?.header).toContain(
      'com.example:service',
    );
  });
});
