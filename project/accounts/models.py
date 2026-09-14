from django.db import models
from django.contrib.auth.models import User
class FriendRequest(models.Model):
    sender=models.ForeignKey(User,on_delete=models.CASCADE,related_name="sent_requests")
    receiver=models.ForeignKey(User,on_delete=models.CASCADE,related_name="received_requests")
    status=models.CharField(max_length=20,
                            choices=[
                                ("pending","Pending"),
                                ("accepted","Accepted"),
                            ],default="pending")
    sent_at=models.DateTimeField(auto_now_add=True)
class FriendShipmodel(models.Model):
    user1=models.ForeignKey(User,on_delete=models.CASCADE,related_name="friendship_user1")
    user2=models.ForeignKey(User,on_delete=models.CASCADE,related_name="friendship_user2")
    created_at=models.DateTimeField(auto_now_add=True)
class Conversation(models.Model):
    participants=models.ManyToManyField(User,related_name="conversations")
    created_at=models.DateTimeField(auto_now_add=True)
class Message(models.Model):
    conversation=models.ForeignKey(Conversation,on_delete=models.CASCADE,related_name="messages")
    sender=models.ForeignKey(User,on_delete=models.CASCADE)
    content=models.TextField()
    timestamp=models.DateTimeField(auto_now_add=True)
class Search(models.Model):
    q=models.CharField(max_length=255)
