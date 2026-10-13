import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;

import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

/** Signe l'APK (schéma v2, suffisant pour minSdk 24) avec apksig puis vérifie la signature. */
public class Sign {
    public static void main(String[] a) throws Exception {
        String keystore = a[0], pass = a[1], alias = a[2];
        File in = new File(a[3]), out = new File(a[4]);
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream f = new FileInputStream(keystore)) { ks.load(f, pass.toCharArray()); }
        PrivateKey key = (PrivateKey) ks.getKey(alias, pass.toCharArray());
        X509Certificate cert = (X509Certificate) ks.getCertificate(alias);
        ApkSigner.SignerConfig sc = new ApkSigner.SignerConfig.Builder("CERT", key, Collections.singletonList(cert)).build();
        new ApkSigner.Builder(Collections.singletonList(sc))
                .setInputApk(in).setOutputApk(out)
                .setV1SigningEnabled(false).setV2SigningEnabled(true) // v2 suffit : minSdk 24
                .build().sign();
        ApkVerifier.Result r = new ApkVerifier.Builder(out).build().verify();
        System.out.println("Signature vérifiée : " + r.isVerified() + " (v1=" + r.isVerifiedUsingV1Scheme() + ", v2=" + r.isVerifiedUsingV2Scheme() + ")");
        for (ApkVerifier.IssueWithParams e : r.getErrors()) System.out.println("ERREUR " + e);
        if (!r.isVerified()) System.exit(1);
    }
}
