import javax.crypto.spec.SecretKeySpec;

public class CryptoKeyFixture {
  public SecretKeySpec key() {
    return new SecretKeySpec("0123456789abcdef".getBytes(), "AES");
  }
}
