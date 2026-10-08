package com.hightopchallenge.clover

import android.os.Bundle
import com.clover.sdk.util.CloverAccount
import com.clover.sdk.v1.Intents
import com.clover.sdk.v3.order.Discount
import com.clover.sdk.v3.order.OrderConnector

/**
 * Facts 2 and 4. Register starts this from the order/payment screen (ACTION_MODIFY_ORDER) with
 * Intents.EXTRA_ORDER_ID. Adds a -$5.00 order-level discount through OrderConnector, reads the
 * total back, and removes it again (Phase 3's Undo).
 */
class ModifyOrderActivity : SpikeActivity() {
    private var orderId: String? = null
    private var discountId: String? = null
    private var connector: OrderConnector? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        orderId = intent.getStringExtra(Intents.EXTRA_ORDER_ID)
        log("Started by action=${intent.action} EXTRA_ORDER_ID=$orderId extras=${intent.extras?.keySet()}")
        val account = CloverAccount.getAccount(this)
        log("CloverAccount=${account?.name ?: "NONE"}")
        if (account != null) connector = OrderConnector(this, account, null).also { it.connect() }

        button("Read order (total before payment?)") { readOrder("read") }
        button("4a. Add -\$5.00 discount") { addDiscount() }
        button("4b. Remove that discount (undo)") { removeDiscount() }
        button("1. Clover token + server-side proof") { proveTokenServerSide() }
        button("3. Scan a code") { startScanner() }
        button("Done: back to Register") { setResult(RESULT_OK); finish() }
    }

    override fun onDestroy() {
        connector?.disconnect()
        super.onDestroy()
    }

    override fun onBarcode(value: String?) {
        log("barcode received on the order screen: starts with HTC1:=${value?.startsWith("HTC1:")}")
    }

    private fun readOrder(label: String) = background(label) {
        val id = orderId ?: return@background log("no order id")
        val order = connector!!.getOrder(id)
        log(
            "$label: state=${order.state} total=${order.total} lineItems=${order.lineItems?.size} " +
                "discounts=${order.discounts?.map { "${it.id}:${it.name}:${it.amount}" }} " +
                "paid=${order.payments?.size ?: 0} payments"
        )
    }

    private fun addDiscount() = background("addDiscount2") {
        val id = orderId ?: return@background log("no order id")
        // Amount discounts are NEGATIVE cents (docs: using-order-connector).
        val discount = Discount().setName("Hightop Challenge: spike").setAmount(-500L)
        val added = connector!!.addDiscount2(id, discount)
        discountId = added.id
        log("addDiscount2 -> id=${added.id} amount=${added.amount} name=${added.name}")
        readOrder("after add")
    }

    private fun removeDiscount() = background("deleteDiscounts") {
        val id = orderId ?: return@background log("no order id")
        val d = discountId ?: return@background log("no discount added in this session")
        connector!!.deleteDiscounts(id, listOf(d))
        log("deleteDiscounts([$d]) ok")
        discountId = null
        readOrder("after remove")
    }
}
