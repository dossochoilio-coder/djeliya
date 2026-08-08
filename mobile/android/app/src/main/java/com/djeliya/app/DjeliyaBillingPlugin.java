package com.djeliya.app;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;
import java.util.List;

/**
 * Greffon Capacitor pour l'achat de crédits via Google Play Billing —
 * obligatoire pour toute vente de contenu numérique consommé dans l'app,
 * sur la plupart des marchés (politique de paiements Google Play).
 *
 * ATTENTION : ce code n'a pas pu être compilé ni testé dans l'environnement de
 * développement — il doit être vérifié sur un vrai appareil (idéalement avec
 * un compte de test Play Console) avant toute mise en production.
 */
@CapacitorPlugin(name = "DjeliyaBilling")
public class DjeliyaBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient billingClient;
    private PluginCall achatEnCours;

    @PluginMethod
    public void initialiser(PluginCall call) {
        billingClient = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases()
                .build();

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    call.resolve();
                } else {
                    call.reject("Connexion à Google Play Billing impossible : " + billingResult.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // Capacitor rappellera initialiser() au besoin depuis le JS ; rien à faire ici.
            }
        });
    }

    @PluginMethod
    public void acheter(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.isEmpty()) {
            call.reject("productId manquant");
            return;
        }
        if (billingClient == null || !billingClient.isReady()) {
            call.reject("Google Play Billing n'est pas prêt — appelle initialiser() d'abord.");
            return;
        }
        if (achatEnCours != null) {
            call.reject("Un achat est déjà en cours.");
            return;
        }

        achatEnCours = call;
        call.setKeepAlive(true);

        QueryProductDetailsParams.Product produit = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build();
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(produit))
                .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || productDetailsList.isEmpty()) {
                if (achatEnCours != null) {
                    achatEnCours.reject("Produit introuvable sur Google Play : " + productId);
                    achatEnCours = null;
                }
                return;
            }

            ProductDetails productDetails = productDetailsList.get(0);
            BillingFlowParams.ProductDetailsParams detailsParams = BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(productDetails)
                    .build();
            BillingFlowParams billingFlowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(detailsParams))
                    .build();

            getActivity().runOnUiThread(() -> billingClient.launchBillingFlow(getActivity(), billingFlowParams));
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        if (achatEnCours == null) return;

        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null && !purchases.isEmpty()) {
            Purchase achat = purchases.get(0);
            JSObject resultat = new JSObject();
            resultat.put("productId", achat.getProducts().get(0));
            resultat.put("purchaseToken", achat.getPurchaseToken());
            resultat.put("orderId", achat.getOrderId());
            achatEnCours.resolve(resultat);
        } else if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            achatEnCours.reject("annule_par_utilisateur");
        } else {
            achatEnCours.reject("Achat impossible : " + billingResult.getDebugMessage());
        }
        achatEnCours = null;
    }
}
